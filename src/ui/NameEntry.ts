type SubmitCallback = (name: string) => void;
type ActionCallback = () => void;

export class NameEntry {
  private readonly overlay: HTMLElement;
  private readonly inputs: HTMLInputElement[] = [];
  private readonly submitBtn: HTMLButtonElement;
  private readonly inputView: HTMLElement;
  private readonly resultsView: HTMLElement;
  private onSubmit: SubmitCallback = () => {};

  constructor() {
    const { overlay, submitBtn, inputView, resultsView } = this.build();
    this.overlay     = overlay;
    this.submitBtn   = submitBtn;
    this.inputView   = inputView;
    this.resultsView = resultsView;
    document.body.appendChild(overlay);
  }

  private build(): { overlay: HTMLElement; submitBtn: HTMLButtonElement; inputView: HTMLElement; resultsView: HTMLElement } {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'z-index:200',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'gap:18px',
      'font-family:"Segoe UI",system-ui,sans-serif',
      'color:#e0e0e0',
      'pointer-events:none',
    ].join(';');

    // ── Input phase ──────────────────────────────────────────────────────────
    const inputView = document.createElement('div');
    inputView.style.cssText = [
      'display:flex',
      'position:fixed',
      'top:80px',
      'left:50%',
      'transform:translateX(-50%)',
      'flex-direction:column',
      'align-items:center',
      'gap:18px',
      'background:rgba(10,12,24,0.92)',
      'border-radius:14px',
      'padding:28px 32px',
      'pointer-events:all',
      'z-index:201',
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
        // Stop Enter/Space from reaching the game loop
        if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        if (e.key === 'Backspace' && !inp.value && i > 0) {
          this.inputs[i - 1].focus();
          this.inputs[i - 1].value = '';
          this.syncSubmit();
        }
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

    inputView.append(title, inputRow, submitBtn);

    // ── Results phase ─────────────────────────────────────────────────────────
    const resultsView = document.createElement('div');
    resultsView.style.cssText = [
      'display:none',
      'position:fixed',
      'bottom:96px',   // sit just above the OSC button bar
      'left:50%',
      'transform:translateX(-50%)',
      'flex-direction:row',
      'align-items:center',
      'gap:10px',
      'background:rgba(10,12,24,0.90)',
      'border-radius:10px',
      'padding:10px 16px',
      'pointer-events:all',
      'z-index:201',
      'white-space:nowrap',
    ].join(';');

    const resultsTitle = document.createElement('div');
    resultsTitle.textContent = '✓ Submitted';
    resultsTitle.style.cssText = 'font-size:0.82rem;font-weight:bold;color:#06d6a0;margin-right:4px';

    const divider = document.createElement('div');
    divider.style.cssText = 'width:1px;height:22px;background:rgba(255,255,255,0.15);margin:0 4px';

    resultsView.append(resultsTitle, divider);
    overlay.append(inputView, resultsView);
    return { overlay, submitBtn, inputView, resultsView };
  }

  private syncSubmit(): void {
    const full = this.inputs.every(i => i.value.length === 1);
    this.submitBtn.disabled      = !full;
    this.submitBtn.style.opacity = full ? '1' : '0.35';
  }

  private trySubmit(): void {
    const name = this.inputs.map(i => i.value).join('');
    if (name.length === 3) this.onSubmit(name);
  }

  show(callback: SubmitCallback): void {
    this.onSubmit = callback;
    this.inputs.forEach(i => { i.value = ''; });
    this.inputView.style.display   = 'flex';
    this.resultsView.style.display = 'none';
    this.overlay.style.display     = 'flex';
    this.syncSubmit();
    setTimeout(() => this.inputs[0].focus(), 60);
  }

  /** Called after score is posted — hides the input, shows Play Again / Main Menu buttons. */
  showResults(onReplay: ActionCallback, onMenu: ActionCallback): void {
    this.inputView.style.display   = 'none';
    this.resultsView.style.display = 'flex';

    // Clear old buttons (in case showResults is called more than once)
    const old = this.resultsView.querySelectorAll('button');
    old.forEach(b => b.remove());

    const btnStyle = (bg: string) => [
      `padding:9px 18px`,
      `font-size:0.85rem`,
      `font-weight:bold`,
      `letter-spacing:.06em`,
      `background:${bg}`,
      `color:#fff`,
      `border:none`,
      `border-radius:8px`,
      `cursor:pointer`,
      `white-space:nowrap`,
    ].join(';');

    const replayBtn = document.createElement('button');
    replayBtn.textContent = '▶  PLAY AGAIN';
    replayBtn.style.cssText = btnStyle('#2d6a9f');
    replayBtn.addEventListener('click', () => { this.hide(); onReplay(); });

    const menuBtn = document.createElement('button');
    menuBtn.textContent = '⌂  MAIN MENU';
    menuBtn.style.cssText = btnStyle('rgba(80,80,100,0.7)');
    menuBtn.addEventListener('click', () => { this.hide(); onMenu(); });

    this.resultsView.append(replayBtn, menuBtn);
  }

  hide(): void {
    this.overlay.style.display     = 'none';
    this.inputView.style.display   = 'flex';
    this.resultsView.style.display = 'none';
  }
}
