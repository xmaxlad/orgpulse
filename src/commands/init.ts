import {Command} from 'commander'
import db from '../db/index'
import createIndexes from '../db/createIndexes'
import {exec} from 'promisify-child-process'

export const init = new Command("init")
    .description("Spin up a mongo container and connect to the MongoDB and create Database, Collections and Indexes") 
    .action(async ()=>{
        console.log(`Spinning up a mongo docker container for you, stay right there...`)
        exec("docker run -d -p 27017:27017 mongo").then(async ()=>{ 
            console.log('Container setup successfull, you have a MongoDB container running at 27017:27017.') 
            await db.connectMongo();
            const database = await db.getDb();
            console.log('Ensuring collections exist...')
            await database.createCollection('repos').catch(()=>{})
            await database.createCollection('issues').catch(()=>{})
            console.log('Creating indexes...')
            await createIndexes();
            console.log('Database ready.')  
        }).catch(err => {
            console.log(`Error encountered while setting up your docker container, ensure you have the docker engine running up and the localhost:27017 is not in use. ${err}`)
        })
        process.exit(1)
    })
