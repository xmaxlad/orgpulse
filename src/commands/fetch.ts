import {Command} from 'commander'
import axios from 'axios' 

const BASE_URL = "https://api.github.com" 

export const fetch = new Command("fetch")
    .description("Fetch the repos for a given organisation")
    .argument("<org>", "The organisation to fetch the repos for")
    .option("-s, --since <string>", "The date since when the repos were created")
    .action(async (org:string, options: {since?: string})=>{ 
        const sinceQueryParam = options.since ? `&since=${options.since}` : ""  
        axios.get(`${BASE_URL}/orgs/${org}/repos${sinceQueryParam}`)  
        .then((res)=>{
            console.log(res.data)
        })
        .catch((err)=>{
            console.error(err)
        }) 
    })
