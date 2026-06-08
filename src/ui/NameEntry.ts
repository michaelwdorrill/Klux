type SubmitCallback = (name: string) => void;

export class NameEntry {
  private readonly overlay: HTMLElement;
  private readonly inputs: HTMLInputElement[] = [];
  private readonly submitBtn: HTMLButtonElement;
  private onSubmit: SubmitCallback = () => {};

  constructor() {
    const { overlay, submitBtn } = this.build();
    this.overlay  = overlay;
    this.submitBtn = submitBtn;
    document.body.appendChild(overlay);
  }

  private build(): { overlay: HTMLElement; submitBtn: HTMLButtonElement } {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'background:rgba(10,12,24,0.88)',
      'z-index:200',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'gap:18px',
      'font-family:"Segoe UI",system-ui,sans-serif',
      'color:#e0e0e0',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'ENTER YOUR INITIALS';
    title.style.cssText = 'font-size:1.15rem;font-weight:bold;letter-spacing:.12em;color:#ffd166';

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:14px';

    for (let i = 0; i < 3; i++) {
      const inp = document.createElement('input');
      inp.type       = 'text';
      inp.maxLength  = 1;
      inp.setAttribute('inputmode', 'text');
      inp.setAttribute('autocomplete', 'off');
      inp.style.cssText = [
        'width:60px',
        'height:68px',
        'font-size:2rem',
        'font-weight:bold',
        'text-align:center',
        'text-transform:uppercase',
        'background:#1a1a2e',
        'color:#e0e0e0',
        'border:2px solid #4a90d9',
        'border-radius:8px',
        'outline:none',
      ].join(';');

      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 1);
        if (inp.value && i < 2) this.inputs[i + 1].focus();
        this.syncSubmit();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && i > 0) {
          this.inputs[i - 1].focus();
          this.inputs[i - 1].value = '';
          this.syncSubmit();
        }
        // Enter on last box submits
        if (e.key === 'Enter') this.trySubmit();
      });

      this.inputs.push(inp);
      inputRow.appendChild(inp);
    }

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'SUBMIT';
    submitBtn.disabled    = true;
    submitBtn.style.cssText = [
      'padding:10px 36px',
      'font-size:1rem',
      'font-weight:bold',
      'letter-spacing:.1em',
      'background:#4a90d9',
      'color:#fff',
      'border:none',
      'border-radius:6px',
      'cursor:pointer',
      'opacity:0.35',
      'transition:opacity .15s',
    ].join(';');
    submitBtn.addEventListener('click', () => this.trySubmit());

    overlay.append(title, inputRow, submitBtn);
    return { overlay, submitBtn };
  }

  private syncSubmit(): void {
    const full = this.inputs.every(i => i.value.length === 1);
    this.submitBtn.disabled     = !full;
    this.submitBtn.style.opacity = full ? '1' : '0.35';
  }

  private trySubmit(): void {
    const name = this.inputs.map(i => i.value).join('');
    if (name.length === 3) this.onSubmit(name);
  }

  show(callback: SubmitCallback): void {
    this.onSubmit = callback;
    this.inputs.forEach(i => { i.value = ''; });
    this.overlay.style.display = 'flex';
    this.syncSubmit();
    setTimeout(() => this.inputs[0].focus(), 60);
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }
}
