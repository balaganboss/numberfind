import './style.css'
import { mount } from './ui.ts'

const app = document.querySelector<HTMLDivElement>('#app')
if (app) mount(app)
