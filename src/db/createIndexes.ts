import { getDb } from './index'

export async function createIndexes(): Promise<void> {
    const db = await getDb()

    const repos = db.collection('repos')
    await repos.createIndex({ org: 1, stars: -1 })
    await repos.createIndex({ org: 1, name: 1 }, { unique: true })

    const issues = db.collection('issues')
    await issues.createIndex({ repo: 1, state: 1 })
    await issues.createIndex({ repo: 1, number: 1 }, { unique: true })
}

export default createIndexes
