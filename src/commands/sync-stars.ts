import { Command } from 'commander'
import axios, { AxiosInstance, AxiosResponse } from 'axios'
import db from '../db/index'

const BASE_URL = "https://api.github.com"

export const syncStars = new Command('sync-stars')
	.description('Refresh stars/forks for repos you already have (lightweight update)')
	.requiredOption('--org <org>', 'Organisation to sync')
	.action(async (options: { org: string }) => {
		const { org } = options
		try {
			const database = await db.getDb()
			const reposCol = database.collection('repos')

			const existing = await reposCol.find({ org }).project({ _id: 0, name: 1 }).toArray() as { name: string }[]
			if (existing.length === 0) {
				console.log(`No repos found locally for org "${org}". Nothing to sync.`)
				return
			}
			const existingNames = new Set(existing.map(r => r.name))

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

			let updatedCount = 0
			const perPage = 100
			let page = 1
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
				if (repos.length === 0) break

				const ops = repos
					.filter(r => existingNames.has(r.name))
					.map(r => ({
						updateOne: {
							filter: { org, name: r.name },
							update: {
								$set: {
									stars: r.stargazers_count ?? 0,
									forks: r.forks_count ?? 0
								}
							}
						}
					}))

				if (ops.length > 0) {
					const result = await reposCol.bulkWrite(ops, { ordered: false })
					updatedCount += (result.modifiedCount + result.upsertedCount)
				}

				page += 1
				await handleRateLimitFromResponse(res)
			}

			console.log(`Sync complete. Updated ${updatedCount} repos for org "${org}".`)
		} catch (err) {
			console.error(err)
		}

        process.exit(1)
	})

export default syncStars
