<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { redirectToLogin, sessionRecovery } from '../security/session'

const dialog = ref(null)

function syncDialog() {
  if (!dialog.value) return
  if (sessionRecovery.status === 'idle') {
    if (dialog.value.open) dialog.value.close()
  } else if (!dialog.value.open) {
    dialog.value.showModal()
  }
}

watch(() => sessionRecovery.status, syncDialog, { flush: 'post' })
onMounted(syncDialog)
onBeforeUnmount(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="modal session-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-dialog-title"
      aria-describedby="session-dialog-message"
      :aria-busy="sessionRecovery.status === 'redirecting'"
      @cancel.prevent
    >
      <span class="session-dialog-icon" aria-hidden="true">!</span>
      <p class="session-dialog-caption">MESSAGEUCOLAB</p>
      <h2 id="session-dialog-title">Tu sesión se perdió</h2>
      <p id="session-dialog-message" class="info" aria-live="polite">{{ sessionRecovery.message }}</p>
      <div class="session-dialog-actions">
        <button
          type="button"
          autofocus
          :disabled="sessionRecovery.status === 'redirecting'"
          @click="redirectToLogin()"
        >
          {{ sessionRecovery.status === 'redirecting' ? 'Conectando…' : 'Volver a Conectar' }}
        </button>
      </div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.session-dialog {
  width: min(460px, calc(100% - 32px));
  max-height: calc(100dvh - 40px);
  padding: 28px;
  overflow-y: auto;
  color: var(--ink);
  background: var(--surface);
}

.session-dialog::backdrop {
  background: rgb(5 20 43 / 55%);
  backdrop-filter: blur(3px);
}

.session-dialog-icon {
  display: grid;
  width: 42px;
  height: 42px;
  margin-bottom: 18px;
  place-items: center;
  border-radius: 10px;
  color: var(--blue);
  background: var(--blue-pale);
  font-size: 24px;
  font-weight: 700;
}

.session-dialog-caption {
  margin: 0 0 6px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
}

.session-dialog h2 {
  margin: 0 0 12px;
  color: var(--navy);
  font-size: 21px;
}

.session-dialog .info {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.session-dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.session-dialog-actions button { min-height: 38px; }
</style>
