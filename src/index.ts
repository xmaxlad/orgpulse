#!/usr/bin/env node
import { Command } from "commander";
import { fetch } from "./commands/fetch";
import { top } from "./commands/top";

const program = new Command();

program
    .name('orgpulse')
    .description('A CLI tool to fetch repos for a given organisation')
    .version('1.0.0');

program.addCommand(fetch);
program.addCommand(top);

program.parse(process.argv); 