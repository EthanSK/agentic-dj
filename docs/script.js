const copyButton = document.querySelector('.terminal-copy');
const commands = `git clone https://github.com/EthanSK/agentic-dj.git
cd agentic-dj
npm ci
npm start`;
copyButton?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(commands);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => { copyButton.textContent = 'Copy'; }, 1800);
  } catch {
    copyButton.textContent = 'Select commands';
  }
});
