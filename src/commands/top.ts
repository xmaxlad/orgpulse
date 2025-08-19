import {Command} from 'commander'
import db from '../db/index'

export const top = new Command("top")
    .description("Show top N repos for an org by stars or open issues from local DB")
    .option("-o, --org <org>", "The organisation", "expressjs") 
    .option("-m, --metric <metric>", "Metric: stars|issues", "stars")
    .option("-l, --limit <limit>", "Number of repos", parseInt, 10)     
    .action(async (options: {org: string, metric: 'stars'|'issues', limit: number})=>{
        const {org, metric} = options
        let { limit } = options
        limit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10

        try {
            const database = await db.getDb()
            const reposCol = database.collection('repos')
            const issuesCol = database.collection('issues')

            const toFullName = (name: string) => `${org}/${name}`

            if (metric === 'stars') {
                const repos = await reposCol
                    .find({ org })
                    .project({ _id: 0, name: 1, stars: 1 })
                    .sort({ stars: -1 })
                    .limit(limit)
                    .toArray()

                const fullNames = repos.map(r => toFullName(r.name))
                const countsAgg = await issuesCol.aggregate([
                    { $match: { repo: { $in: fullNames }, state: 'open' } },
                    { $group: { _id: '$repo', count: { $sum: 1 } } }
                ]).toArray()
                const repoToOpenIssues = new Map(countsAgg.map(row => [row._id as string, row.count as number]))

                const rows = repos.map(r => ({
                    name: r.name,
                    stars: r.stars ?? 0,
                    issues: repoToOpenIssues.get(toFullName(r.name)) ?? 0
                }))

                rows.sort((a, b) => b.stars - a.stars)
                console.table(rows)
                return
            }

            // metric === 'issues'
            const issueLeaders = await issuesCol.aggregate([
                { $match: { repo: { $regex: `^${org}/` }, state: 'open' } },
                { $group: { _id: '$repo', issues: { $sum: 1 } } },
                { $sort: { issues: -1 } },
                { $limit: limit }
            ]).toArray()

            const names = issueLeaders.map(row => (row._id as string).split('/')[1])
            const starsDocs = await reposCol.find({ org, name: { $in: names } }).project({ _id: 0, name: 1, stars: 1 }).toArray()
            const nameToStars = new Map(starsDocs.map(d => [d.name as string, (d.stars as number) ?? 0]))

            const rows = issueLeaders.map(row => {
                const fullName = row._id as string
                const name = fullName.split('/')[1]
                return {
                    name,
                    stars: nameToStars.get(name) ?? 0,
                    issues: row.issues as number
                }
            })

            rows.sort((a, b) => b.issues - a.issues)
            console.table(rows)
        } catch (err) {
            console.error(err)
        }

        process.exit(1)
    })
