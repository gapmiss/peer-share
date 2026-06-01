import { App, Modal } from 'obsidian';

interface StatisticsData {
  totalTransfers: number;
  totalSent: number;
  totalReceived: number;
  totalBytesSent: number;
  totalBytesReceived: number;
  successRate: number;
  topPeers: { name: string; count: number }[];
}

export class StatisticsModal extends Modal {
  private stats: StatisticsData;
  private formatFileSize: (bytes: number) => string;

  constructor(
    app: App,
    stats: StatisticsData,
    formatFileSize: (bytes: number) => string
  ) {
    super(app);
    this.stats = stats;
    this.formatFileSize = formatFileSize;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('peer-share-statistics-modal');

    // Header
    contentEl.createEl('h2', { text: 'Transfer statistics' });

    // Overall stats
    const overallSection = contentEl.createDiv({ cls: 'peer-share-stats-section' });
    overallSection.createEl('h3', { text: 'Overview' });

    const overallStats = overallSection.createDiv({ cls: 'peer-share-stats-grid' });

    this.createStatItem(overallStats, 'Total Transfers', this.stats.totalTransfers.toString());
    this.createStatItem(overallStats, 'Sent', `${this.stats.totalSent} (${this.formatFileSize(this.stats.totalBytesSent)})`);
    this.createStatItem(overallStats, 'Received', `${this.stats.totalReceived} (${this.formatFileSize(this.stats.totalBytesReceived)})`);
    this.createStatItem(overallStats, 'Success Rate', `${(this.stats.successRate * 100).toFixed(1)}%`);

    // Top peers
    if (this.stats.topPeers.length > 0) {
      const peersSection = contentEl.createDiv({ cls: 'peer-share-stats-section' });
      peersSection.createEl('h3', { text: 'Top peers' });

      const peersList = peersSection.createDiv({ cls: 'peer-share-stats-peers' });
      for (const peer of this.stats.topPeers) {
        const peerItem = peersList.createDiv({ cls: 'peer-share-stats-peer-item' });
        peerItem.createSpan({ text: peer.name, cls: 'peer-share-stats-peer-name' });
        peerItem.createSpan({
          text: `${peer.count} transfer${peer.count !== 1 ? 's' : ''}`,
          cls: 'peer-share-stats-peer-count'
        });
      }
    }

    // Footer
    const footer = contentEl.createDiv({ cls: 'peer-share-modal-footer' });
    const closeBtn = footer.createEl('button', { text: 'Close' });
    closeBtn.onclick = () => this.close();
  }

  private createStatItem(container: HTMLElement, label: string, value: string): void {
    const item = container.createDiv({ cls: 'peer-share-stat-item' });
    item.createDiv({ text: label, cls: 'peer-share-stat-label' });
    item.createDiv({ text: value, cls: 'peer-share-stat-value' });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
