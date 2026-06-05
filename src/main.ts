import './style.css'
import { mountApp } from './ui'

const root = document.querySelector<HTMLDivElement>('#app')
if (root) {
  mountApp(root)
}
