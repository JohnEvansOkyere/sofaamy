import React, { useState } from 'react'
import Configurator from './components/Configurator.jsx'
import './App.css'

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <div className="logo-mark">S</div>
          <div>
            <div className="logo-name">Sofaamy Co. Ltd</div>
            <div className="logo-sub">Design Configurator — Beta</div>
          </div>
        </div>
        <div className="topbar-right">
          <span className="badge-live">● Live Demo</span>
          <span className="topbar-meta">Powered by Veloxa Technology</span>
        </div>
      </header>
      <main className="app-main">
        <Configurator />
      </main>
    </div>
  )
}
