import { build, CliError, init, parseCliArgs, preview, schema, validate } from './commands';
import { diff, exportManifest, ingest, lint } from './smarts';

const VERSION = '0.2.0';

const HELP = `AppLens ${VERSION}: interactive showcases for your apps, built from one manifest file.

Usage
  app-lens init [file] [--name "My App"] [--force]   Create a starter manifest and its JSON schema
  app-lens validate <file>                           Check a manifest and report problems
  app-lens build <file> [--out folder] [--force]     Generate a static showcase site (default: app-lens-site)
  app-lens preview <file|folder> [--port 4317]       Build if needed and serve locally
                   [--watch]                         Rebuild and reload when the manifest changes
  app-lens lint <file> [--min-score 80]              Score the manifest and suggest improvements
  app-lens diff <before> <after>                     List what changed between two manifests
  app-lens ingest openapi|prisma|readme <file>       Draft a manifest from an existing spec
                   [--out file] [--report file] [--force]
  app-lens export md|pdf <file> [--out file]         Write a one-pager
  app-lens schema [--out file]                       Print or write the manifest JSON schema

Options
  -h, --help      Show this help
  -v, --version   Show the version
`;

async function main(): Promise<void> {
  const { values, positionals } = parseCliArgs(process.argv.slice(2));
  const [command, target, third] = positionals;

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
    case 'lint':
      if (!lint(required(), values)) process.exitCode = 1;
      break;
    case 'diff':
      diff(required(), third);
      break;
    case 'ingest':
      ingest(required(), third, values);
      break;
    case 'export':
      exportManifest(required(), third, values);
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
