import {Command} from 'commander'
import axios, { AxiosInstance, AxiosResponse } from 'axios'
import db from '../db/index'
import fs from 'fs'
import path from 'path'

const BASE_URL = "https://api.github.com" 

export const fetch = new Command("fetch")
    .description("Fetch public repos for an org, store repos and latest issues with upserts, supporting resume via checkpoint.json")
    .argument("<org>", "The organisation to fetch the repos for")
    .option("-s, --since <string>", "Only process repos created since YYYY-MM-DD")
    .action(async (org:string, options: {since?: string})=>{ 
        const sinceDate = options.since ? new Date(options.since) : null
        if (options.since && Number.isNaN(sinceDate!.getTime())) {
            console.error(`Invalid --since date. Use YYYY-MM-DD`)
            return
        }

        const token = (process.env.GITHUB_TOKEN || '').trim()
        const http: AxiosInstance = axios.create({
            baseURL: BASE_URL,
            headers: {
                'Accept': 'application/vnd.github+json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                'User-Agent': 'orgpulse-cli'
            },
            validateStatus: (status) => status >= 200 && status < 500
        })

        const checkpointPath = path.resolve(process.cwd(), 'checkpoint.json')
        type Checkpoint = { org: string; since: string | null; page: number; index: number }

        const readCheckpoint = (): Checkpoint | null => {
            try {
                const raw = fs.readFileSync(checkpointPath, 'utf-8')
                const parsed: Checkpoint = JSON.parse(raw)
                if (parsed.org === org && (parsed.since || null) === (sinceDate ? options.since! : null)) {
                    return parsed
                }
                return null
            } catch {
                return null
            }
        }

        const writeCheckpoint = (cp: Checkpoint) => {
            fs.writeFileSync(checkpointPath, JSON.stringify(cp, null, 2))
        }

        const clearCheckpoint = () => {
            try { fs.unlinkSync(checkpointPath) } catch {}
        }

        const sleep = (ms: number) => new Promise(res => setTimeout(res, ms))

        const handleRateLimitFromResponse = async (res: AxiosResponse<any>) => {
            const remaining = parseInt(res.headers['x-ratelimit-remaining'] ?? '1', 10)
            if (remaining <= 1) {
                const resetEpoch = parseInt(res.headers['x-ratelimit-reset'] ?? '0', 10)
                const waitMs = Math.max(0, resetEpoch * 1000 - Date.now()) + 1000
                if (waitMs > 0) {
                    console.log(`Rate limit near/at exhaustion. Waiting ${(waitMs/1000).toFixed(0)}s...`)
                    await sleep(waitMs)
                }
            }
        }

        const database = await db.getDb()
        const reposCol = database.collection('repos')
        const issuesCol = database.collection('issues')

        const perPage = 100
        let page = 1
        let startIndex = 0

        const existingCp = readCheckpoint()
        if (existingCp) {
            page = Math.max(1, existingCp.page)
            startIndex = Math.max(0, existingCp.index + 1)
            console.log(`Resuming from checkpoint: page=${page}, index=${startIndex}`)
        }

        while (true) {
            const res = await http.get(`/orgs/${org}/repos`, { params: { per_page: perPage, page } })
            if (res.status === 403) {
                await handleRateLimitFromResponse(res)
                continue
            }
            if (res.status >= 400) {
                console.error(`Failed to fetch repos page ${page}: ${res.status} ${res.statusText}`)
                break
            }

            const repos: any[] = Array.isArray(res.data) ? res.data : []
            if (repos.length === 0) {
                break
            }

            for (let i = startIndex; i < repos.length; i++) {
                const repo = repos[i]
                const createdAt: string | null = repo.created_at ?? null
                if (sinceDate && createdAt && new Date(createdAt) < sinceDate) {
                    // Skip repos older than since date
                    writeCheckpoint({ org, since: sinceDate ? options.since! : null, page, index: i })
                    continue
                }

                // Upsert repo document
                await reposCol.updateOne(
                    { org, name: repo.name },
                    {
                        $set: {
                            org,
                            name: repo.name,
                            description: repo.description ?? null,
                            topics: Array.isArray(repo.topics) ? repo.topics : [],
                            language: repo.language ?? null,
                            stars: repo.stargazers_count ?? 0,
                            forks: repo.forks_count ?? 0,
                            openIssues: repo.open_issues_count ?? 0,
                            license: repo.license?.spdx_id ?? null,
                            pushedAt: repo.pushed_at ?? null
                        }
                    },
                    { upsert: true }
                )

                // Fetch latest 30 issues for this repo (exclude PRs)
                const fullName = `${org}/${repo.name}`
                const issuesRes = await http.get(`/repos/${org}/${repo.name}/issues`, {
                    params: { state: 'all', sort: 'created', direction: 'desc', per_page: 30 }
                })

                if (issuesRes.status === 403) {
                    await handleRateLimitFromResponse(issuesRes)
                } else if (issuesRes.status >= 400) {
                    console.error(`Failed to fetch issues for ${fullName}: ${issuesRes.status} ${issuesRes.statusText}`)
                } else {
                    const issues: any[] = Array.isArray(issuesRes.data) ? issuesRes.data : []
                    const onlyIssues = issues.filter((it) => !it.pull_request)
                    if (onlyIssues.length > 0) {
                        const ops = onlyIssues.map((it) => ({
                            updateOne: {
                                filter: { repo: fullName, number: it.number },
                                update: {
                                    $set: {
                                        repo: fullName,
                                        number: it.number,
                                        title: it.title ?? '',
                                        state: it.state ?? 'open',
                                        createdAt: it.created_at ?? null
                                    }
                                },
                                upsert: true
                            }
                        }))
                        await issuesCol.bulkWrite(ops, { ordered: false })
                    }
                }

                // Update checkpoint after each repo
                writeCheckpoint({ org, since: sinceDate ? options.since! : null, page, index: i })
            }

            // Finished page; move to next
            page += 1
            startIndex = 0
            await handleRateLimitFromResponse(res)
        }

        clearCheckpoint()
        console.log('Fetch complete.')
        process.exit(1)
    })
