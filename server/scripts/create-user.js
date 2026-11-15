// Create a staff account from the command line (used for the very first admin).
// Usage: npm run user:create -- --username dana --name "Dana Levi" --password "<10+ chars>" [--admin]

import { parseArgs } from 'node:util';
import { openDatabase } from '../src/db.js';
import { configuredDbPath } from '../src/config.js';
import { createUser } from '../src/auth.js';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    name: { type: 'string' },
    password: { type: 'string' },
    admin: { type: 'boolean', default: false },
  },
});

for (const required of ['username', 'name', 'password']) {
  if (!values[required]) throw new Error(`--${required} is required`);
}

const db = openDatabase(configuredDbPath());
const id = createUser(db, {
  username: values.username,
  display_name: values.name,
  password: values.password,
  role: values.admin ? 'admin' : 'member',
});
console.log(`Created ${values.admin ? 'admin' : 'member'} user "${values.username}" (id ${id})`);
