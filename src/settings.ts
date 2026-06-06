import { App, Notice, PluginSettingTab, Setting, setIcon } from 'obsidian';
import type { SettingDefinitionItem } from 'obsidian';
import type PeerSharePlugin from './main';
import type { PairedDevice } from './types';
import { ConfirmModal } from './modals';
import { FolderSuggest } from './folder-suggest';
import { t } from './i18n';

export class PeerShareSettingTab extends PluginSettingTab {
  plugin: PeerSharePlugin;
  private boundRefreshHandler: () => void;
  private boundUpdateConnectionStatus: () => void;
  private statusIconEl: HTMLElement | null = null;
  private statusTextEl: HTMLElement | null = null;
  private connectionButton: HTMLButtonElement | null = null;
  private pairedDevicesContentEl: HTMLElement | null = null;

  constructor(app: App, plugin: PeerSharePlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.boundRefreshHandler = () => this.update();
    this.boundUpdateConnectionStatus = () => this.update();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      // Connection & Server
      {
        type: 'group',
        heading: t('settings.server.title'),
        items: [
          {
            name: t('settings.server.url.name'),
            desc: t('settings.server.url.desc'),
            control: {
              type: 'text',
              key: 'serverUrl',
              placeholder: t('settings.server.url.placeholder'),
              validate: (value: string) => {
                const trimmed = value.trim();
                if (trimmed && !this.isValidWebSocketUrl(trimmed)) {
                  return 'Invalid server URL. Must start with ws:// or wss://';
                }
                return undefined;
              },
            },
          },
          {
            name: t('settings.connection.status.name'),
            render: (setting: Setting) => this.renderConnectionStatus(setting),
          },
          {
            name: t('settings.connection.reconnect.name'),
            desc: t('settings.connection.reconnect.desc'),
            render: (setting: Setting) => this.renderConnectionButton(setting),
          },
          {
            name: t('settings.behavior.auto-connect.name'),
            desc: t('settings.behavior.auto-connect.desc'),
            control: { type: 'toggle', key: 'autoConnect' },
          },
          {
            name: t('settings.discovery.mode.name'),
            desc: t('settings.discovery.mode.desc'),
            render: (setting: Setting) => this.renderDiscoveryMode(setting),
          },
        ],
      },

      // Paired Devices
      {
        type: 'group',
        heading: t('settings.paired-devices.title'),
        items: [
          {
            name: t('command.pair-device'),
            desc: t('pairing-modal.description'),
            action: (_index: number) => this.plugin.showPairingModal(),
          },
          {
            name: t('settings.paired-devices.list'),
            render: (setting: Setting) => this.renderPairedDevicesList(setting),
          },
        ],
      },

      // Files & Behavior
      {
        type: 'group',
        heading: t('settings.files.title'),
        items: [
          {
            name: t('settings.files.location.name'),
            desc: t('settings.files.location.desc'),
            render: (setting: Setting) => this.renderSaveLocation(setting),
          },
          {
            name: t('settings.behavior.system-notifications.name'),
            desc: t('settings.behavior.system-notifications.desc'),
            control: { type: 'toggle', key: 'useSystemNotifications' },
          },
          {
            name: t('settings.behavior.log-level.name'),
            desc: t('settings.behavior.log-level.desc'),
            control: {
              type: 'dropdown',
              key: 'logLevel',
              options: {
                none: t('settings.behavior.log-level.none'),
                error: t('settings.behavior.log-level.error'),
                warn: t('settings.behavior.log-level.warn'),
                info: t('settings.behavior.log-level.info'),
                debug: t('settings.behavior.log-level.debug'),
              },
            },
          },
        ],
      },

      // Share History
      {
        type: 'group',
        heading: 'Share history',
        items: [
          {
            name: 'Enable history tracking',
            desc: 'Track sent and received file transfers in the history sidebar',
            render: (setting: Setting) => this.renderHistoryEnabled(setting),
          },
          {
            name: 'History retention',
            desc: 'How long to keep transfer history (0 = keep forever)',
            render: (setting: Setting) => this.renderHistoryRetention(setting),
          },
          {
            name: 'Open history sidebar',
            desc: 'View your transfer history',
            action: (_index: number) => this.openHistorySidebar(),
          },
          {
            name: 'Clear all history',
            desc: 'Permanently delete all transfer history',
            action: (_index: number) => this.confirmClearHistory(),
          },
        ],
      },
    ];
  }

  display(): void {
    // Register event listeners for dynamic updates
    if (this.plugin.peerManager) {
      this.plugin.peerManager.off('secret-room-deleted', this.boundRefreshHandler);
      this.plugin.peerManager.off('paired-device-identified', this.boundRefreshHandler);
      this.plugin.peerManager.off('server-connected', this.boundUpdateConnectionStatus);
      this.plugin.peerManager.off('server-disconnected', this.boundUpdateConnectionStatus);

      this.plugin.peerManager.on('secret-room-deleted', this.boundRefreshHandler);
      this.plugin.peerManager.on('paired-device-identified', this.boundRefreshHandler);
      this.plugin.peerManager.on('server-connected', this.boundUpdateConnectionStatus);
      this.plugin.peerManager.on('server-disconnected', this.boundUpdateConnectionStatus);
    }
  }

  private renderConnectionStatus(setting: Setting): void {
    const statusContainer = setting.controlEl.createDiv({ cls: 'peer-share-status' });
    this.statusIconEl = statusContainer.createDiv({ cls: 'peer-share-status-icon' });
    const isConnected = this.plugin.isConnected();
    setIcon(this.statusIconEl, isConnected ? 'link' : 'unlink');
    this.statusIconEl.setCssProps({
      color: isConnected ? 'var(--text-success)' : 'var(--text-error)',
    });

    this.statusTextEl = statusContainer.createSpan({
      text: isConnected ? t('common.connected') : t('common.disconnected'),
      cls: isConnected ? 'peer-share-status-connected' : 'peer-share-status-disconnected',
    });
  }

  private renderConnectionButton(setting: Setting): void {
    const isConnected = this.plugin.isConnected();
    setting.addButton((button) => {
      this.connectionButton = button.buttonEl;
      button
        .setButtonText(isConnected ? t('common.disconnect') : t('common.connect'))
        .onClick(async () => {
          await this.plugin.toggleConnection();
          this.update();
        });
    });
  }

  private renderDiscoveryMode(setting: Setting): void {
    setting.addDropdown((dropdown) =>
      dropdown
        .addOption('auto', t('settings.discovery.mode.auto'))
        .addOption('paired-only', t('settings.discovery.mode.paired-only'))
        .setValue(this.plugin.settings.discoveryMode)
        .onChange(async (value) => {
          const mode = value as 'auto' | 'paired-only';
          this.plugin.settings.discoveryMode = mode;
          await this.plugin.saveSettings();
          if (this.plugin.isConnected()) {
            await this.plugin.peerManager?.switchDiscoveryMode(mode);
          }
        })
    );
  }

  private renderPairedDevicesList(setting: Setting): void {
    setting.settingEl.classList.add('peer-share-paired-devices-setting');
    this.pairedDevicesContentEl = setting.controlEl.createDiv({
      cls: 'peer-share-paired-devices-content',
    });
    this.renderPairedDevicesContent(this.pairedDevicesContentEl);
  }

  private renderPairedDevicesContent(container: HTMLElement): void {
    const pairedDevices = this.plugin.settings.pairedDevices;

    if (pairedDevices.length === 0) {
      const emptyState = container.createDiv({ cls: 'peer-share-paired-empty' });
      emptyState.createEl('p', {
        text: t('settings.paired-devices.empty'),
        cls: 'peer-share-paired-empty-text',
      });
    } else {
      const pairedList = container.createDiv({ cls: 'peer-share-paired-list' });

      for (const device of pairedDevices) {
        this.renderPairedDevice(pairedList, device);
      }

      if (pairedDevices.length > 1) {
        new Setting(container)
          .setName(t('settings.paired-devices.remove-all.name'))
          .setDesc(t('settings.paired-devices.remove-all.desc'))
          .addButton((button) =>
            button
              .setButtonText(t('settings.paired-devices.remove-all.button'))
              .setDestructive()
              .onClick(() => {
                new ConfirmModal(
                  this.app,
                  t('settings.paired-devices.remove-all-confirm.title'),
                  t('settings.paired-devices.remove-all-confirm.message', pairedDevices.length),
                  () => {
                    void (async () => {
                      for (const device of [...this.plugin.settings.pairedDevices]) {
                        await this.plugin.removePairedDevice(device.roomSecret);
                      }
                      this.update();
                    })();
                  },
                  t('confirm-modal.remove')
                ).open();
              })
          );
      }
    }
  }

  private renderPairedDevice(container: HTMLElement, device: PairedDevice): void {
    const item = container.createDiv({ cls: 'peer-share-paired-item' });

    const info = item.createDiv({ cls: 'peer-share-paired-info' });

    const details = info.createDiv({ cls: 'peer-share-paired-details' });
    details.createDiv({ cls: 'peer-share-paired-name', text: device.displayName });
    details.createDiv({
      cls: 'peer-share-paired-date',
      text: t('settings.paired-devices.paired-at', new Date(device.pairedAt).toLocaleString()),
    });

    const controls = item.createDiv({ cls: 'peer-share-paired-controls' });

    new Setting(controls)
      .setName(t('settings.paired-devices.auto-accept.name'))
      .setDesc(t('settings.paired-devices.auto-accept.desc'))
      .addToggle((toggle) =>
        toggle.setValue(device.autoAccept).onChange(async (value) => {
          await this.plugin.updatePairedDeviceAutoAccept(device.roomSecret, value);
        })
      );

    const removeBtn = item.createEl('button', {
      cls: 'peer-share-paired-remove',
      attr: { 'aria-label': t('settings.paired-devices.remove.label') },
    });
    setIcon(removeBtn, 'x');
    removeBtn.onclick = () => {
      new ConfirmModal(
        this.app,
        t('settings.paired-devices.remove-confirm.title'),
        t('settings.paired-devices.remove-confirm.message', device.displayName),
        () => {
          void (async () => {
            await this.plugin.removePairedDevice(device.roomSecret);
            this.update();
          })();
        },
        t('confirm-modal.remove')
      ).open();
    };
  }

  private renderSaveLocation(setting: Setting): void {
    setting.addSearch((search) => {
      search
        .setPlaceholder(t('settings.files.location.placeholder'))
        .setValue(this.plugin.settings.saveLocation)
        .onChange(async (value) => {
          this.plugin.settings.saveLocation = value;
          await this.plugin.saveSettings();
        });

      new FolderSuggest(this.app, search.inputEl);
    });
  }

  private renderHistoryEnabled(setting: Setting): void {
    setting.addToggle((toggle) =>
      toggle.setValue(this.plugin.settings.history.enabled).onChange(async (value) => {
        this.plugin.settings.history.enabled = value;
        await this.plugin.saveSettings();
        if (this.plugin.shareHistory) {
          await this.plugin.shareHistory.updateSettings(this.plugin.settings.history);
        }
      })
    );
  }

  private renderHistoryRetention(setting: Setting): void {
    setting.addDropdown((dropdown) =>
      dropdown
        .addOption('0', 'Forever')
        .addOption('7', '7 Days')
        .addOption('30', '30 Days')
        .addOption('90', '90 Days')
        .addOption('180', '180 Days')
        .addOption('365', '1 Year')
        .setValue(this.plugin.settings.history.retentionDays.toString())
        .onChange(async (value) => {
          this.plugin.settings.history.retentionDays = parseInt(value);
          await this.plugin.saveSettings();
          if (this.plugin.shareHistory) {
            await this.plugin.shareHistory.updateSettings(this.plugin.settings.history);
          }
        })
    );
  }

  private openHistorySidebar(): void {
    const existingLeaf = this.app.workspace.getLeavesOfType('peer-share-history')[0];
    if (existingLeaf) {
      this.app.workspace.setActiveLeaf(existingLeaf);
    } else {
      const leaf = this.app.workspace.getRightLeaf(false);
      void leaf?.setViewState({
        type: 'peer-share-history',
        active: true,
      });
    }
  }

  private confirmClearHistory(): void {
    new ConfirmModal(
      this.app,
      'Clear all history?',
      'This will permanently delete all transfer history. This cannot be undone.',
      () => {
        void (async () => {
          if (this.plugin.shareHistory) {
            await this.plugin.shareHistory.clearAll();
            new Notice('History cleared');
          }
        })();
      },
      'Clear'
    ).open();
  }

  private isValidWebSocketUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  }

  hide(): void {
    if (this.plugin.peerManager) {
      this.plugin.peerManager.off('secret-room-deleted', this.boundRefreshHandler);
      this.plugin.peerManager.off('paired-device-identified', this.boundRefreshHandler);
      this.plugin.peerManager.off('server-connected', this.boundUpdateConnectionStatus);
      this.plugin.peerManager.off('server-disconnected', this.boundUpdateConnectionStatus);
    }
    this.statusIconEl = null;
    this.statusTextEl = null;
    this.connectionButton = null;
    this.pairedDevicesContentEl = null;
  }
}
