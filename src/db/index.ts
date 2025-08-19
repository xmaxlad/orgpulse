import { Db, MongoClient } from 'mongodb'

let cachedClient: MongoClient | null = null

async function connectMongo(): Promise<MongoClient> {
    if (cachedClient) return cachedClient

    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017'
    console.log(`Mongo URI detected is - ${uri}`)
    const client = new MongoClient(uri)
    await client.connect()
    cachedClient = client
    return client
}

export async function getDb(): Promise<Db> {
    const client = await connectMongo()
    return client.db('github')
}

export default {
    connectMongo,
    getDb
}