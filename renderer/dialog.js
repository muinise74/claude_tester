// 공통 alert / confirm 대체 다이얼로그

function showAlert(message) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal dialog-modal">
        <div class="dialog-message">${escDialogHtml(message)}</div>
        <div class="modal-actions">
          <button class="btn btn-primary dialog-ok">확인</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const ok = backdrop.querySelector('.dialog-ok');
    const close = () => { backdrop.remove(); resolve(); };
    ok.addEventListener('click', close);
    backdrop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === 'Escape') close(); });
    ok.focus();
  });
}

function showConfirm(message) {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal dialog-modal">
        <div class="dialog-message">${escDialogHtml(message)}</div>
        <div class="modal-actions">
          <button class="btn btn-secondary dialog-cancel">취소</button>
          <button class="btn btn-danger dialog-ok">확인</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const ok     = backdrop.querySelector('.dialog-ok');
    const cancel = backdrop.querySelector('.dialog-cancel');
    const close  = (result) => { backdrop.remove(); resolve(result); };
    ok.addEventListener('click', () => close(true));
    cancel.addEventListener('click', () => close(false));
    backdrop.addEventListener('keydown', e => {
      if (e.key === 'Enter')  close(true);
      if (e.key === 'Escape') close(false);
    });
    ok.focus();
  });
}

function escDialogHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
