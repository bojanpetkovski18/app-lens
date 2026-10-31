import { build, CliError, init, parseCliArgs, preview, schema, validate } from './commands';

const VERSION = '0.2.0';

const HELP = `AppLens ${VERSION}: interactive showcases for your apps, built from one manifest file.

Usage
  app-lens init [file] [--name "My App"] [--force]   Create a starter manifest and its JSON schema
  app-lens validate <file>                           Check a manifest and report problems
  app-lens build <file> [--out folder] [--force]     Generate a static showcase site (default: app-lens-site)
  app-lens preview <file|folder> [--port 4317]       Build if needed and serve locally
  app-lens schema [--out file]                       Print or write the manifest JSON schema

Options
  -h, --help      Show this help
  -v, --version   Show the version
`;

async function main(): Promise<void> {
  const { values, positionals } = parseCliArgs(process.argv.slice(2));
  const [command, target] = positionals;

  if (values.version) {
    console.log(VERSION);
    return;
  }
  if (values.help || !command || command === 'help') {
    console.log(HELP);
    return;
  }

  const required = (): string => {
    if (!target) throw new CliError(`"${command}" needs a file. Run "app-lens --help".`);
    return target;
  };

  switch (command) {
    case 'init':
      init(target, values);
      break;
    case 'validate':
      if (!validate(required())) process.exitCode = 1;
      break;
    case 'build':
      build(required(), values);
      break;
    case 'preview':
      await preview(required(), values);
      break;
    case 'schema':
      schema(values);
      break;
    default:
      throw new CliError(`Unknown command "${command}". Run "app-lens --help".`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliError) {
    console.error(`app-lens: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
