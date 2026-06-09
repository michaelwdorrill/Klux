import { VsClient } from '../vs/VsClient';

type StartCallback = (matchId: string, seed: number, player: 'a' | 'b') => void;

export class VsLobby {
  private readonly overlay: HTMLElement;
  private readonly client = new VsClient();
  private onStart: StartCallback = () => {};
  /** Pending match that hasn't started yet (player A waiting for B). */
  private pendingMatch: { id: string; seed: number } | null = null;
  private resumeBtn: HTMLButtonElement | null = null;

  constructor() {
    this.overlay = this.build();
    document.body.appendChild(this.overlay);
  }

  getClient(): VsClient { return this.client; }

  show(onStart: StartCallback): void {
    this.onStart = onStart;
    if (this.pendingMatch) {
      // Resume the waiting view with the same code
      this.showWaiting(this.pendingMatch.id, this.pendingMatch.seed);
    } else {
      this.showView('main');
    }
    this.overlay.style.display = 'flex';
    this.updateResumeBtn();
  }

  hide(): void {
    this.overlay.style.display = 'none';
    // Don't stop polling or clear pendingMatch — player may reopen to check
  }

  private updateResumeBtn(): void {
    if (this.resumeBtn) {
      this.resumeBtn.style.display = this.pendingMatch ? '' : 'none';
      if (this.pendingMatch) {
        this.resumeBtn.textContent = `RESUME (${this.pendingMatch.id})`;
      }
    }
  }

  private showView(view: 'main' | 'waiting' | 'join' | 'error'): void {
    for (const el of this.overlay.querySelectorAll<HTMLElement>('[data-view]')) {
      el.style.display = el.dataset['view'] === view ? '' : 'none';
    }
  }

  private build(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'background:rgba(10,12,24,0.92)',
      'z-index:200',
      'align-items:center',
      'justify-content:center',
      'flex-direction:column',
      'gap:20px',
      'font-family:"Segoe UI",system-ui,sans-serif',
      'color:#e0e0e0',
    ].join(';');

    const title = document.createElement('div');
    title.textContent = 'VS MODE';
    title.style.cssText = 'font-size:1.5rem;font-weight:bold;letter-spacing:.15em;color:#9bd1ff';

    // ── Main view ─────────────────────────────────────────────────────────
    const mainView = document.createElement('div');
    mainView.dataset['view'] = 'main';
    mainView.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center';

    const createBtn = document.createElement('button');
    createBtn.textContent = 'CREATE MATCH';
    createBtn.style.cssText = btnStyle('#4a90d9');
    createBtn.addEventListener('click', async () => {
      try {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating…';
        const { id, seed } = await this.client.create();
        this.showWaiting(id, seed);
      } catch {
        createBtn.disabled = false;
        createBtn.textContent = 'CREATE MATCH';
        this.showError('Could not create match. Try again.');
      }
    });

    const orLine = document.createElement('div');
    orLine.textContent = '— or —';
    orLine.style.cssText = 'font-size:.85rem;color:rgba(180,180,200,0.5)';

    const joinBtn = document.createElement('button');
    joinBtn.textContent = 'JOIN WITH CODE';
    joinBtn.style.cssText = btnStyle('#06d6a0');
    joinBtn.addEventListener('click', () => this.showView('join'));

    // Resume button — shown only when a pending match exists
    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = 'RESUME';
    resumeBtn.style.cssText = btnStyle('#f4a261') + ';display:none';
    resumeBtn.addEventListener('click', () => {
      if (this.pendingMatch) this.showWaiting(this.pendingMatch.id, this.pendingMatch.seed);
    });
    this.resumeBtn = resumeBtn;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Back';
    cancelBtn.style.cssText = ghostBtnStyle();
    cancelBtn.addEventListener('click', () => this.hide());

    mainView.append(createBtn, orLine, joinBtn, resumeBtn, cancelBtn);

    // ── Waiting view ──────────────────────────────────────────────────────
    const waitingView = document.createElement('div');
    waitingView.dataset['view'] = 'waiting';
    waitingView.style.cssText = 'display:none;flex-direction:column;gap:14px;align-items:center';

    const waitLabel = document.createElement('div');
    waitLabel.textContent = 'Share this code with your opponent:';
    waitLabel.style.cssText = 'font-size:.9rem;color:rgba(180,180,200,0.8)';

    const codeDisplay = document.createElement('div');
    codeDisplay.id = 'vs-code';
    codeDisplay.style.cssText = [
      'font-size:3rem',
      'font-weight:bold',
      'letter-spacing:.3em',
      'color:#ffd166',
      'background:rgba(255,209,102,0.1)',
      'padding:10px 28px',
      'border-radius:10px',
      'border:2px solid rgba(255,209,102,0.3)',
    ].join(';');

    const waitStatus = document.createElement('div');
    waitStatus.id = 'vs-wait-status';
    waitStatus.textContent = 'Waiting for opponent…';
    waitStatus.style.cssText = 'font-size:.85rem;color:rgba(180,180,200,0.6)';

    const hideWaitBtn = document.createElement('button');
    hideWaitBtn.textContent = 'Hide (keep waiting)';
    hideWaitBtn.style.cssText = ghostBtnStyle();
    hideWaitBtn.addEventListener('click', () => this.hide());

    const cancelWaitBtn = document.createElement('button');
    cancelWaitBtn.textContent = 'Cancel match';
    cancelWaitBtn.style.cssText = 'background:transparent;color:rgba(220,80,80,0.6);border:1px solid rgba(220,80,80,0.25);border-radius:6px;padding:5px 18px;font-size:.8rem;cursor:pointer';
    cancelWaitBtn.addEventListener('click', () => {
      this.pendingMatch = null;
      this.client.stopPolling();
      this.showView('main');
      this.updateResumeBtn();
    });

    waitingView.append(waitLabel, codeDisplay, waitStatus, hideWaitBtn, cancelWaitBtn);

    // ── Join view ─────────────────────────────────────────────────────────
    const joinView = document.createElement('div');
    joinView.dataset['view'] = 'join';
    joinView.style.cssText = 'display:none;flex-direction:column;gap:14px;align-items:center';

    const joinLabel = document.createElement('div');
    joinLabel.textContent = 'Enter the 4-letter code:';
    joinLabel.style.cssText = 'font-size:.9rem;color:rgba(180,180,200,0.8)';

    const codeInput = document.createElement('input');
    codeInput.maxLength = 4;
    codeInput.setAttribute('autocomplete', 'off');
    codeInput.style.cssText = [
      'width:140px',
      'height:56px',
      'font-size:2rem',
      'font-weight:bold',
      'text-align:center',
      'text-transform:uppercase',
      'letter-spacing:.2em',
      'background:#1a1a2e',
      'color:#ffd166',
      'border:2px solid #4a90d9',
      'border-radius:8px',
      'outline:none',
    ].join(';');
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
      doJoinBtn.disabled = codeInput.value.length !== 4;
      doJoinBtn.style.opacity = codeInput.value.length === 4 ? '1' : '0.35';
    });

    const doJoinBtn = document.createElement('button');
    doJoinBtn.textContent = 'JOIN';
    doJoinBtn.disabled = true;
    doJoinBtn.style.cssText = btnStyle('#06d6a0') + ';opacity:0.35';
    doJoinBtn.addEventListener('click', async () => {
      try {
        doJoinBtn.disabled = true;
        doJoinBtn.textContent = 'Joining…';
        const { id, seed, player } = await this.client.join(codeInput.value);
        this.hide();
        this.onStart(id, seed, player);
      } catch {
        doJoinBtn.disabled = false;
        doJoinBtn.textContent = 'JOIN';
        this.showError('Code not found or match already started.');
      }
    });
    codeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !doJoinBtn.disabled) doJoinBtn.click();
    });

    const backBtn = document.createElement('button');
    backBtn.textContent = 'Back';
    backBtn.style.cssText = ghostBtnStyle();
    backBtn.addEventListener('click', () => { codeInput.value = ''; this.showView('main'); });

    joinView.append(joinLabel, codeInput, doJoinBtn, backBtn);

    // ── Error view ────────────────────────────────────────────────────────
    const errorView = document.createElement('div');
    errorView.dataset['view'] = 'error';
    errorView.style.cssText = 'display:none;flex-direction:column;gap:14px;align-items:center';

    const errorMsg = document.createElement('div');
    errorMsg.id = 'vs-error-msg';
    errorMsg.style.cssText = 'font-size:.9rem;color:#e63946;text-align:center;max-width:260px';

    const errorBackBtn = document.createElement('button');
    errorBackBtn.textContent = 'Back';
    errorBackBtn.style.cssText = ghostBtnStyle();
    errorBackBtn.addEventListener('click', () => this.showView('main'));

    errorView.append(errorMsg, errorBackBtn);

    overlay.append(title, mainView, waitingView, joinView, errorView);
    return overlay;
  }

  private showWaiting(id: string, seed: number): void {
    this.pendingMatch = { id, seed };
    const codeEl = this.overlay.querySelector('#vs-code');
    if (codeEl) codeEl.textContent = id;
    this.showView('waiting');

    // Poll for the 'joined' event from player B
    this.client.onEvent = (ev) => {
      if (ev.type === 'joined') {
        this.pendingMatch = null;
        this.client.stopPolling();
        this.hide();
        this.onStart(id, seed, 'a');
      }
    };
    this.client.startPolling();
  }

  private showError(msg: string): void {
    const el = this.overlay.querySelector('#vs-error-msg');
    if (el) el.textContent = msg;
    this.showView('error');
  }
}

function btnStyle(bg: string): string {
  return [
    `background:${bg}`,
    'color:#fff',
    'border:none',
    'border-radius:6px',
    'padding:10px 32px',
    'font-size:1rem',
    'font-weight:bold',
    'letter-spacing:.08em',
    'cursor:pointer',
    'min-width:180px',
  ].join(';');
}

function ghostBtnStyle(): string {
  return [
    'background:transparent',
    'color:rgba(180,180,200,0.6)',
    'border:1px solid rgba(180,180,200,0.25)',
    'border-radius:6px',
    'padding:7px 24px',
    'font-size:.85rem',
    'cursor:pointer',
  ].join(';');
}
