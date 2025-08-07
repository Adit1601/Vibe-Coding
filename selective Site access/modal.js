// modal.js

let onConfirm = null;

function showModal(message, confirmCallback) {
  document.getElementById('modal-message').textContent = message;
  document.getElementById('confirmation-modal').style.display = 'block';
  onConfirm = confirmCallback;
}

function hideModal() {
  document.getElementById('confirmation-modal').style.display = 'none';
  onConfirm = null;
}

document.getElementById('modal-confirm-btn').addEventListener('click', () => {
  if (onConfirm) {
    onConfirm();
  }
  hideModal();
});

document.getElementById('modal-cancel-btn').addEventListener('click', () => {
  hideModal();
});

export { showModal };