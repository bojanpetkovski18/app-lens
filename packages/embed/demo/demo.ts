import taskpilot from '../../../samples/taskpilot.app-lens.json';

const element = document.querySelector<HTMLElementTagNameMap['app-lens']>('#taskpilot');
if (element) element.manifest = taskpilot;

document.addEventListener('app-lens:error', (event) => {
  console.error('AppLens error', (event as CustomEvent<{ message: string }>).detail.message);
});
