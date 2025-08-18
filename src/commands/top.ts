import {Command} from 'commander'
import axios from 'axios'

const BASE_URL = "https://api.github.com"

export const top = new Command("top")
    .description("Fetch the top given number of repos for a given organisation")
    .option("-o, --org <org>", "The organisation to fetch the repos for","expressjs") 
    .option("-m, --metric <metric>", "The metric to use to fetch the repos for", "stars")
    .option("-l, --limit <limit>", "The number of repos to fetch", parseInt,10)     
    .action(async (options: {org: string, metric: string, limit: number})=>{
        const {org, metric, limit} = options;
        await axios.get(`${BASE_URL}/orgs/${org}/repos?sort=${metric === "stars" ? "stargazers_count" : metric}&per_page=${limit}`)
            .then((res)=>{       
                console.log(res.data)
            })
            .catch((err)=>{
                console.error(err)
            })  
    })
