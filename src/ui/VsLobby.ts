import { VsClient } from '../vs/VsClient';
import type { Difficulty } from '../core/types';

type StartCallback = (matchId: string, seed: number, player: 'a' | 'b', difficulty: Difficulty, myName: string) => void;

export class VsLobby {
  private readonly overlay: HTMLElement;
  private readonly client = new VsClient();
  private onStart: StartCallback = () => {};
  /** Pending match that hasn't started yet (player A waiting for B). */
  private pendingMatch: { id: string; seed: number } | null = null;
  private resumeBtn: HTMLButtonElement | null = null;
  private createBtn: HTMLButtonElement | null = null;
  private selectedDifficulty: Difficulty = 'normal';
  private nameInput: HTMLInputElement | null = null;

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
      // Reset create button in case a previous match ended with it stuck
      if (this.createBtn) {
        this.createBtn.disabled = false;
        this.createBtn.textContent = 'CREATE MATCH';
      }
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

  private showView(view: 'main' | 'waiting' | 'join' | 'error' | 'difficulty'): void {
    for (const el of this.overlay.querySelectorAll<HTMLElement>('[data-view]')) {
      el.style.display = el.dataset['view'] === view ? '' : 'none';
    }
  }

  private async doCreate(difficulty: Difficulty): Promise<void> {
    this.selectedDifficulty = difficulty;
    const createBtn = this.createBtn;
    try {
      if (createBtn) {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating…';
      }
      const { id, seed } = await this.client.create();
      this.showWaiting(id, seed);
    } catch {
      if (createBtn) {
        createBtn.disabled = false;
        createBtn.textContent = 'CREATE MATCH';
      }
      this.showError('Could not create match. Try again.');
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

    // Name input row
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:10px';
    const nameLabel = document.createElement('span');
    nameLabel.textContent = 'Your name:';
    nameLabel.style.cssText = 'font-size:.85rem;color:rgba(180,180,200,0.8)';
    const nameInput = document.createElement('input');
    nameInput.maxLength = 3;
    nameInput.value = localStorage.getItem('klux.v1.vsName') ?? '';
    nameInput.style.cssText = 'width:64px;height:38px;font-size:1.4rem;font-weight:bold;text-align:center;text-transform:uppercase;background:#1a1a2e;color:#ffd166;border:2px solid #4a90d9;border-radius:6px;outline:none;letter-spacing:.15em';
    nameInput.addEventListener('input', () => {
      nameInput.value = nameInput.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
      localStorage.setItem('klux.v1.vsName', nameInput.value);
    });
    nameRow.append(nameLabel, nameInput);
    this.nameInput = nameInput;

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
    this.createBtn = createBtn;
    createBtn.addEventListener('click', () => {
      this.showView('difficulty');
    });

    const orLine = document.createElement('div');
    orLine.textContent = '— or —';
    orLine.style.cssText = 'font-size:.85rem;color:rgba(180,180,200,0.5);margin-bottom:8px';

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

    const joinRow = document.createElement('div');
    joinRow.style.cssText = 'display:flex;gap:12px;align-items:center';
    joinRow.append(joinBtn, cancelBtn);

    mainView.append(createBtn, orLine, joinRow, resumeBtn);

    // ── Difficulty view ────────────────────────────────────────────────────
    const diffView = document.createElement('div');
    diffView.dataset['view'] = 'difficulty';
    diffView.style.cssText = 'display:none;flex-direction:column;gap:12px;align-items:center;min-width:220px';

    const diffTitle = document.createElement('div');
    diffTitle.textContent = 'PICK DIFFICULTY';
    diffTitle.style.cssText = 'font-size:1rem;font-weight:bold;letter-spacing:.1em;color:rgba(155,209,255,0.8)';

    const mkDiffBtn = (diff: Difficulty, label: string, color: string) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = btnStyle(color) + ';min-width:220px';
      btn.addEventListener('click', () => this.doCreate(diff));
      return btn;
    };
    const normalBtn = mkDiffBtn('normal', 'NORMAL', 'rgba(6,214,160,0.3)');
    normalBtn.style.border = '2px solid rgba(6,214,160,0.5)';
    normalBtn.style.color = '#06d6a0';
    const hardBtn = mkDiffBtn('hard', 'HARD', 'rgba(244,162,97,0.3)');
    hardBtn.style.border = '2px solid rgba(244,162,97,0.5)';
    hardBtn.style.color = '#f4a261';
    const eliteBtn = mkDiffBtn('elite', 'ELITE', 'rgba(239,71,111,0.3)');
    eliteBtn.style.border = '2px solid rgba(239,71,111,0.5)';
    eliteBtn.style.color = '#ef476f';

    const diffBackBtn = document.createElement('button');
    diffBackBtn.textContent = 'Back';
    diffBackBtn.style.cssText = ghostBtnStyle();
    diffBackBtn.addEventListener('click', () => this.showView('main'));

    diffView.append(diffTitle, normalBtn, hardBtn, eliteBtn, diffBackBtn);

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
        this.onStart(id, seed, player, 'normal', nameInput.value || 'P2');
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

    overlay.append(nameRow, title, mainView, diffView, waitingView, joinView, errorView);
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
        this.onStart(id, seed, 'a', this.selectedDifficulty, this.nameInput?.value || 'P1');
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
