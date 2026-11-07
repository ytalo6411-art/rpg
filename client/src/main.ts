import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { TitleScene } from "./scenes/TitleScene";
import { CharacterCreationScene } from "./scenes/CharacterCreationScene";
import { GameScene } from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1a1a2e",
  width: 960,
  height: 640,
  zoom: 1,
  render: {
    pixelArt: true,
    antialias: false,
  },
  scene: [BootScene, TitleScene, CharacterCreationScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    min: { width: 640, height: 360 },
    max: { width: 1920, height: 1080 },
  },
  audio: {
    disableWebAudio: false,
  },
};

export const game = new Phaser.Game(config);
