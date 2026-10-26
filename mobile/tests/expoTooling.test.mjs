import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const cli = path.dirname(
  require.resolve('@expo/cli/package.json', {
    paths: [path.dirname(require.resolve('expo/package.json'))],
  }),
);
const schemas = require(path.join(cli, 'build/src/start/server/DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = require(
  path.join(cli, 'build/src/start/server/createMCPDevToolsExtensionSchema.js'),
);
test('patched tooling validator preserves Expo plugin descriptors, commands and output validation', () => {
  const plugin = {
    packageName: 'synthetic-plugin',
    packageRoot: '/synthetic',
    cliExtensions: {
      description: 'Synthetic',
      entryPoint: 'cli.js',
      commands: [
        {
          name: 'inspect',
          title: 'Inspect',
          environments: ['cli', 'mcp'],
          parameters: [
            { name: 'count', type: 'number' },
            { name: 'label', type: 'text' },
            { name: 'enabled', type: 'confirm' },
          ],
        },
      ],
    },
  };
  assert(schemas.PluginSchema.safeParse(plugin).success);
  assert(!schemas.PluginSchema.safeParse({ ...plugin, packageName: 2 }).success);
  const command = createMCPDevToolsExtensionSchema(plugin);
  assert(command.safeParse({ command: 'inspect', count: 2, label: 'Test', enabled: true }).success);
  for (const bad of [
    { command: 'unknown' },
    { command: 'inspect', count: '2' },
    { command: 'inspect', unexpected: true },
  ])
    assert(!command.safeParse(bad).success);
  assert(
    schemas.DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 'OK', level: 'info' }])
      .success,
  );
  assert(
    !schemas.DevToolsPluginOutputSchema.safeParse([{ type: 'text', text: 2, level: 'info' }])
      .success,
  );
});
