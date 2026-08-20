import { reactive } from 'vue'

// Estado global compartido entre todos los componentes (reactivo).
export const store = reactive({
  token: localStorage.getItem('token') || '',
  setToken(value) {
    this.token = value
    localStorage.setItem('token', value)
  }
})
