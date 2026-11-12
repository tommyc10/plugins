import { run } from '../src/cli.ts';

console.log(run(process.argv.slice(2), 'tasks.json'));
