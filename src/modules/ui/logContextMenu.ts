/**
 * 日志分析右键菜单
 * 提供复制和 AI 解释功能
 */

import * as IconPark from '@icon-park/svg'
import { aiService } from '../ai/aiService'

export class LogContextMenu {
  private contextMenu: HTMLElement | null = null
  private modal: HTMLElement | null = null
  private currentLogContent: string = ''

  constructor() {
    this.createContextMenu()
    this.createModal()
    this.setupEventListeners()
  }

  /**
   * 创建右键菜单
   */
  private createContextMenu() {
    const menu = document.createElement('div')
    menu.id = 'log-context-menu'
    menu.style.cssText = `
      position: fixed;
      display: none;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: var(--border-radius);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      min-width: 160px;
      padding: var(--spacing-xs) 0;
    `

    menu.innerHTML = `
      <div class="menu-item" data-action="copy">
        <span class="menu-label">
          ${IconPark.Copy({ theme: 'outline', size: '14', fill: 'currentColor' })}
          <span>复制内容</span>
        </span>
      </div>
      <div class="menu-divider"></div>
      <div class="menu-item" data-action="ai-explain">
        <span class="menu-label">
          ${IconPark.Brain({ theme: 'outline', size: '14', fill: 'currentColor' })}
          <span>AI 解释含义</span>
        </span>
      </div>
    `

    // 添加样式
    const style = document.createElement('style')
    style.textContent = `
      #log-context-menu .menu-item {
        padding: 8px 12px;
        cursor: pointer;
        font-size: 13px;
        color: var(--text-primary);
        transition: background-color 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #log-context-menu .menu-item:hover {
        background: var(--bg-tertiary);
      }
      #log-context-menu .menu-label {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      #log-context-menu .menu-divider {
        height: 1px;
        background: var(--border-color);
        margin: 4px 0;
      }
    `
    document.head.appendChild(style)

    document.body.appendChild(menu)
    this.contextMenu = menu
  }

  /**
   * 创建模态框
   */
  private createModal() {
    const modal = document.createElement('div')
    modal.id = 'log-detail-modal'
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10001;
      backdrop-filter: blur(2px);
    `

    modal.innerHTML = `
      <div class="modal-content" style="
        background: var(--bg-primary);
        border-radius: var(--border-radius);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: scaleIn 0.2s ease-out;
      ">
        <div class="modal-header" style="
          padding: var(--spacing-md);
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-secondary);
        ">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${IconPark.Log({ theme: 'outline', size: '20', fill: 'currentColor' })}
            <h3 style="margin: 0; font-size: 16px;">日志详情</h3>
          </div>
          <button id="log-modal-close" style="
            background: none;
            border: none;
            font-size: 20px;
            cursor: pointer;
            color: var(--text-secondary);
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
          ">&times;</button>
        </div>
        
        <div class="modal-body" style="
          padding: var(--spacing-md);
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        ">
          <!-- 原始内容区域 -->
          <div class="content-section">
            <div style="
              font-size: 12px; 
              color: var(--text-secondary); 
              margin-bottom: 6px; 
              text-transform: uppercase;
              font-weight: 600;
            ">原始内容</div>
            <div id="log-original-content" style="
              font-family: var(--font-mono);
              font-size: 12px;
              color: var(--text-primary);
              white-space: pre-wrap;
              word-break: break-all;
              padding: 12px;
              background: var(--bg-secondary);
              border-radius: var(--border-radius);
              border: 1px solid var(--border-color);
              line-height: 1.5;
            "></div>
          </div>

          <!-- AI 解释区域 -->
          <div id="log-ai-section" class="ai-section" style="display: none;">
            <div style="
              font-size: 12px; 
              color: var(--text-secondary); 
              margin-bottom: 6px; 
              text-transform: uppercase;
              font-weight: 600;
              display: flex;
              align-items: center;
              gap: 6px;
            ">
              ${IconPark.Brain({ theme: 'outline', size: '14', fill: 'currentColor' })}
              AI 智能分析
            </div>
            <div style="
              padding: 16px;
              background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(147, 51, 234, 0.05) 100%);
              border-radius: var(--border-radius);
              border: 1px solid rgba(59, 130, 246, 0.2);
            ">
              <div id="log-ai-content" style="
                font-size: 13px;
                line-height: 1.6;
                color: var(--text-primary);
                white-space: pre-wrap;
              "></div>
            </div>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(modal)
    this.modal = modal
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    // 点击菜单项
    this.contextMenu?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const menuItem = target.closest('.menu-item') as HTMLElement
      if (menuItem) {
        const action = menuItem.getAttribute('data-action')
        if (action) {
          this.handleAction(action)
        }
        this.hideContextMenu()
      }
    })

    // 关闭模态框
    document.getElementById('log-modal-close')?.addEventListener('click', () => {
      this.hideModal()
    })

    // 点击模态框外部关闭
    this.modal?.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hideModal()
      }
    })

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
      if (this.contextMenu && this.contextMenu.style.display !== 'none') {
        if (!this.contextMenu.contains(e.target as Node)) {
          this.hideContextMenu()
        }
      }
    })
  }

  /**
   * 处理菜单动作
   */
  private handleAction(action: string) {
    switch (action) {
      case 'copy':
        navigator.clipboard.writeText(this.currentLogContent).then(() => {
          // 可以添加一个小的 toast 提示
          console.log('日志内容已复制')
        })
        break
      case 'ai-explain':
        this.showModalWithAI()
        break
    }
  }

  /**
   * 显示右键菜单
   */
  public showContextMenu(x: number, y: number, content: string) {
    if (!this.contextMenu) return

    this.currentLogContent = content

    this.contextMenu.style.left = `${x}px`
    this.contextMenu.style.top = `${y}px`
    this.contextMenu.style.display = 'block'

    // 边界检测
    const rect = this.contextMenu.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      this.contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`
    }
    if (rect.bottom > window.innerHeight) {
      this.contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`
    }
  }

  /**
   * 隐藏右键菜单
   */
  private hideContextMenu() {
    if (this.contextMenu) {
      this.contextMenu.style.display = 'none'
    }
  }

  /**
   * 显示带有 AI 解释的模态框
   */
  private async showModalWithAI() {
    if (!this.modal) return

    const contentEl = document.getElementById('log-original-content')
    const aiSection = document.getElementById('log-ai-section')
    const aiContent = document.getElementById('log-ai-content')

    if (contentEl) contentEl.textContent = this.currentLogContent
    if (aiSection) aiSection.style.display = 'block'
    if (aiContent) aiContent.textContent = '🤔 AI 正在分析日志内容...'

    this.modal.style.display = 'flex'

    try {
      await aiService.explainLogStream(
        this.currentLogContent,
        undefined,
        (chunk) => {
          if (aiContent && aiContent.textContent?.startsWith('🤔')) {
            aiContent.textContent = ''
          }
          if (aiContent) aiContent.textContent += chunk
        },
        () => {
          console.log('AI 分析完成')
        }
      )
    } catch (error) {
      if (aiContent) {
        aiContent.innerHTML = `<span style="color: var(--error-color)">❌ 分析失败: ${error instanceof Error ? error.message : String(error)}</span><br><br><small>请检查 设置 -> AI 配置 是否正确。</small>`
      }
    }
  }

  /**
   * 隐藏模态框
   */
  private hideModal() {
    if (this.modal) {
      this.modal.style.display = 'none'
      // 清空内容
      const aiContent = document.getElementById('log-ai-content')
      if (aiContent) aiContent.textContent = ''
    }
  }
}
