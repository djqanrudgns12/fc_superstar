import Phaser from 'phaser';

export interface BootSceneData {
  mode?: 'match' | 'training';
  matchData?: any;
  trainingData?: any;
}

export class BootScene extends Phaser.Scene {
  private initData?: BootSceneData;

  constructor() {
    super({ key: 'BootScene' });
  }

  init(data?: BootSceneData) {
    this.initData = data;
  }

  create() {
    // If no mode is specified (e.g. on initial Phaser startup), do nothing and stay idle
    if (!this.initData || !this.initData.mode) {
      return;
    }

    // Direct, instant transition without artificial delays
    if (this.initData.mode === 'training') {
      this.scene.start('TrainingScene', this.initData.trainingData);
    } else {
      this.scene.start('MatchScene', this.initData.matchData);
    }
  }
}
