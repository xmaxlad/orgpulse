import { Command } from 'commander'
import db from '../db/index'
import fs from 'fs'
import path from 'path'

type RepoRow = {
	name: string
	stars?: number
	forks?: number
	openIssues?: number
	pushedAt?: string | null
	language?: string | null
}

function toCsvValue(value: unknown): string {
	if (value === null || value === undefined) return '""'
	const str = String(value)
	const escaped = str.replace(/"/g, '""')
	return `"${escaped}"`
}

export const exportCmd = new Command('export')
	.description('Export repos for an org to CSV')
	.requiredOption('--org <org>', 'Organisation to export')
	.requiredOption('--out <file>', 'Output CSV file path')
	.action(async (options: { org: string; out: string }) => {
		const { org, out } = options
		try {
			const database = await db.getDb()
			const reposCol = database.collection('repos')
			const rows = await reposCol
				.find({ org })
				.project({ _id: 0, name: 1, stars: 1, forks: 1, openIssues: 1, pushedAt: 1, language: 1 })
				.sort({ stars: -1 })
				.toArray() as unknown as RepoRow[]

			const header = ['name', 'stars', 'forks', 'openIssues', 'pushedAt', 'language']
			const lines = [header.join(',')]
			for (const r of rows) {
				lines.push([
					toCsvValue(r.name),
					toCsvValue(r.stars ?? 0),
					toCsvValue(r.forks ?? 0),
					toCsvValue(r.openIssues ?? 0),
					toCsvValue(r.pushedAt ?? ''),
					toCsvValue(r.language ?? '')
				].join(','))
			}

			const outPath = path.resolve(process.cwd(), out)
			fs.writeFileSync(outPath, lines.join('\n'))
			console.log(`Wrote ${rows.length} rows to ${outPath}`)
		} catch (err) {
			console.error(err)
		}
	
		process.exit(1)
	})

export default exportCmd
