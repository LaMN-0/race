/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, TouchEvent } from 'react';
import { Play, RotateCcw, Home, Award, ArrowLeft, Pause, User, Edit2, Check } from 'lucide-react';

// ==========================================
// 型定義
// ==========================================
type ScreenType = 'title' | 'stage_select' | 'time_record' | 'game' | 'result';

interface Obstacle {
  id: number;
  z: number;       // 奥行き座標
  x: number;       // 左右位置 (-60〜60)
  width: number;   // 幅
  height: number;  // 高さ
  depth: number;   // 奥行き幅
  type: 'hurdle' | 'tunnel' | 'wall'; // 障害物の形状
  color: string;
}

interface RankingRecord {
  name: string;
  time: number; // 秒数
  date: string;
}

interface Stage {
  id: number;
  name: string;
  difficulty: '★☆☆' | '★★☆' | '★★★' | '★★★★' | '★★★★★';
  length: number;    // ゴールまでのZ距離
  baseObstacles: number; // 障害物の基本設置数
}

// ステージ定義（3〜5個：今回は4ステージ）
const STAGES: Stage[] = [
  { id: 1, name: "ルーキールート（ステージ1）", difficulty: "★☆☆", length: 1500, baseObstacles: 15 },
  { id: 2, name: "アーバンチェイス（ステージ2）", difficulty: "★★☆", length: 2000, baseObstacles: 22 },
  { id: 3, name: "スカイラインラン（ステージ3）", difficulty: "★★★", length: 2500, baseObstacles: 30 },
  { id: 4, name: "マスターテラス（ステージ4）", difficulty: "★★★★★", length: 3000, baseObstacles: 40 },
];

// 初期ダミーランキング（サーバーとの非同期同期をモック）
const DEFAULT_RANKINGS: Record<number, RankingRecord[]> = {
  1: [
    { name: "ハヤト", time: 24.32, date: "2026/06/15" },
    { name: "サクラ", time: 26.54, date: "2026/06/16" },
    { name: "Takumi", time: 28.10, date: "2026/06/14" },
    { name: "ユウキ", time: 31.25, date: "2026/06/16" },
    { name: "Guest_A", time: 35.80, date: "2026/06/13" },
  ],
  2: [
    { name: "Takumi", time: 35.12, date: "2026/06/15" },
    { name: "ハヤト", time: 37.45, date: "2026/06/16" },
    { name: "Kenji", time: 39.90, date: "2026/06/14" },
    { name: "ミサキ", time: 42.15, date: "2026/06/16" },
    { name: "れん", time: 48.30, date: "2026/06/13" },
  ],
  3: [
    { name: "ハヤト", time: 45.20, date: "2026/06/15" },
    { name: "Takumi", time: 48.65, date: "2026/06/16" },
    { name: "アリス", time: 51.30, date: "2026/06/15" },
    { name: "ショウタ", time: 54.80, date: "2026/06/12" },
    { name: "Guest_B", time: 61.20, date: "2026/06/14" },
  ],
  4: [
    { name: "ゴッドランナー", time: 51.40, date: "2026/06/16" },
    { name: "ハヤト", time: 55.10, date: "2026/06/15" },
    { name: "Takumi", time: 58.75, date: "2026/06/16" },
    { name: "レイナ", time: 64.20, date: "2026/06/14" },
    { name: "たつや", time: 72.50, date: "2026/06/13" },
  ],
};

export default function App() {
  // ==========================================
  // 状態管理
  // ==========================================
  const [screen, setScreen] = useState<ScreenType>('title');
  const [selectedStage, setSelectedStage] = useState<Stage>(STAGES[0]);
  const [playerName, setPlayerName] = useState<string>('ゲストランナー');
  const [showNameEdit, setShowNameEdit] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>('');
  
  // スコア・実績（ローカルストレージ＝模擬サーバー同期）
  const [personalBests, setPersonalBests] = useState<Record<number, number>>({});
  const [rankings, setRankings] = useState<Record<number, RankingRecord[]>>(DEFAULT_RANKINGS);
  const [lastClearTime, setLastClearTime] = useState<number>(0);
  const [isNewRecord, setIsNewRecord] = useState<boolean>(false);

  // ゲームプレイ状態
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(-1);

  // 同期用Ref（ループ内のクロージャ最新値参照用）
  const isPausedRef = useRef<boolean>(false);
  const countdownRef = useRef<number>(-1);
  const selectedStageRef = useRef<Stage>(selectedStage);
  const playerNameRef = useRef<string>(playerName);
  const rankingsRef = useRef<Record<number, RankingRecord[]>>(rankings);
  const personalBestsRef = useRef<Record<number, number>>(personalBests);

  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);
  useEffect(() => { countdownRef.current = countdown; }, [countdown]);
  useEffect(() => { selectedStageRef.current = selectedStage; }, [selectedStage]);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  useEffect(() => { rankingsRef.current = rankings; }, [rankings]);
  useEffect(() => { personalBestsRef.current = personalBests; }, [personalBests]);

  // ==========================================
  // Ref・キャンバス関係
  // ==========================================
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 入力状態の参照
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  const mobileInput = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  // ------------------------------------------
  // ゲームパラメータ
  // ------------------------------------------
  const gameRef = useRef({
    player: {
      x: 0,            // 左右位置（-80〜80が道幅、中央が0）
      y: 0,            // ジャンプ高さ
      z: 0,            // 進行距離
      vy: 0,           // 上下速度
      state: 'running' as 'running' | 'jumping' | 'sliding' | 'ledge_grabbing' | 'finished',
      width: 15,
      height: 30,
      grabTimer: 0,    // レッジグラブアニメーション時間
      color: '#3b82f6', // 青
    },
    cpu: {
      x: 15,           // CPUの左右位置（プレイヤーにぶつからないよう少しズレて走る）
      y: 0,
      z: 0,
      vy: 0,
      state: 'running' as 'running' | 'jumping' | 'sliding' | 'ledge_grabbing' | 'finished',
      width: 15,
      height: 30,
      grabTimer: 0,
      color: '#f43f5e', // 赤
      currentTargetZ: 0, // AI用の次の予定パス
      actionTimer: 0,   // AI判断用タイマー
    },
    obstacles: [] as Obstacle[],
    startTime: 0,
    elapsedTime: 0,
    courseLength: 1500,
    roadWidth: 200,    // 3D透視用道幅
    maxSpeed: 12,      // 最大基本速度
    gravity: 0.6,
  });

  // ==========================================
  // 初期化・ローカルストレージロード
  // ==========================================
  useEffect(() => {
    // ゲスト名のロード
    const savedName = localStorage.getItem('parkour_player_name');
    if (savedName) {
      setPlayerName(savedName);
    } else {
      setShowNameEdit(true); // 初回起動時に入力を促す
      setTempName('ゲストランナー');
    }

    // パーソナルベストのロード
    const savedBests = localStorage.getItem('parkour_personal_bests');
    if (savedBests) {
      setPersonalBests(JSON.parse(savedBests));
    }

    // ランキングのロード（サーバーから同期したデータを模す）
    const savedRankings = localStorage.getItem('parkour_rankings');
    if (savedRankings) {
      setRankings(JSON.parse(savedRankings));
    } else {
      localStorage.setItem('parkour_rankings', JSON.stringify(DEFAULT_RANKINGS));
    }
  }, []);

  // ゲスト名保存
  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (trimmed) {
      setPlayerName(trimmed);
      localStorage.setItem('parkour_player_name', trimmed);
      setShowNameEdit(false);
    }
  };

  // カウントダウン処理
  useEffect(() => {
    if (screen !== 'game' || countdown <= 0 || isPaused) return;

    const timer = setTimeout(() => {
      setCountdown(prev => {
        if (prev === 1) {
          gameRef.current.startTime = Date.now(); // 開始時間をカウントダウン完了時点にリセット
          return 0; // 開始
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [screen, countdown, isPaused]);

  // ==========================================
  // 入力イベントハンドラー (PC)
  // ==========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;

      if (screen !== 'game' || isPaused) return;

      // ジャンプ (Space)
      if (e.key === ' ' || e.code === 'Space') {
        const p = gameRef.current.player;
        if (p.state === 'running' || p.state === 'sliding') {
          p.vy = 12;
          p.state = 'jumping';
          p.height = 30; // 通常の高さに戻す
        }
        e.preventDefault();
      }

      // スライディング (Shift)
      if (e.key.toLowerCase() === 'shift') {
        const p = gameRef.current.player;
        if (p.state === 'running' || p.state === 'jumping') {
          p.state = 'sliding';
          p.height = 15; // 姿勢を低くする
          p.vy = 0; // 空中なら即着地を模す
          p.y = 0;
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;

      if (screen !== 'game') return;

      // スライディング解除
      if (e.key.toLowerCase() === 'shift') {
        const p = gameRef.current.player;
        if (p.state === 'sliding') {
          p.state = 'running';
          p.height = 30;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [screen, isPaused]);

  // ==========================================
  // タッチ・フリック操作ハンドラー (スマホ)
  // ==========================================
  const handleTouchStart = (e: TouchEvent) => {
    if (screen !== 'game' || isPaused) return;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (screen !== 'game' || isPaused || !touchStartPos.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    // 仮想スライドパッド模擬（タッチ点の変位で左右操作）
    const limit = 40;
    const clampedDx = Math.max(-limit, Math.min(limit, dx)) / limit;
    
    mobileInput.current.dx = clampedDx;
  };

  const handleTouchEnd = (e: TouchEvent) => {
    if (screen !== 'game' || isPaused || !touchStartPos.current) return;
    
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;

    // フリック検知としきい値
    const swipeThreshold = 50;

    if (dy > swipeThreshold) {
      // 下フリック -> スライディング
      const p = gameRef.current.player;
      if (p.state === 'running' || p.state === 'jumping') {
        p.state = 'sliding';
        p.height = 15;
        p.vy = 0;
        p.y = 0;
        // 一定時間後に自動で走るに戻す
        setTimeout(() => {
          if (p.state === 'sliding') {
            p.state = 'running';
            p.height = 30;
          }
        }, 800);
      }
    } else if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
      // 短いタップ -> ジャンプ
      const p = gameRef.current.player;
      if (p.state === 'running' || p.state === 'sliding') {
        p.vy = 12;
        p.state = 'jumping';
        p.height = 30;
      }
    }

    // タッチ初期化
    touchStartPos.current = null;
    mobileInput.current.dx = 0;
  };

  // ==========================================
  // ステージ生成・障害物配置 (ランダム生成)
  // ==========================================
  const generateStageObstacles = (stage: Stage): Obstacle[] => {
    const list: Obstacle[] = [];
    const stepLength = stage.length / stage.baseObstacles;
    
    // コース開始150m、終了150mはフラットで障害物を置かない
    const minZ = 150;
    const maxZ = stage.length - 150;

    let currentZ = minZ;

    for (let i = 0; i < stage.baseObstacles; i++) {
      // 間隔をランダムにする (詰まって配置されたり、平坦があったり)
      // 一定ではなく 50%〜150% のランダムゆらぎを与える
      const intervalNoise = (Math.random() * 1.2 + 0.4);
      currentZ += stepLength * intervalNoise;

      if (currentZ > maxZ) break;

      // 障害物の形状 3つのうちいずれか
      // 'hurdle': 小さい、ジャンプで飛び越え可能
      // 'tunnel': 低い天井、スライディング必須
      // 'wall': 高い崖、レッジグラブ（崖登り）必須
      const randType = Math.random();
      let type: 'hurdle' | 'tunnel' | 'wall' = 'hurdle';
      let height = 20;
      let width = 50;
      let depth = 15;
      let color = '#f59e0b'; // 黄色

      if (randType < 0.33) {
        type = 'hurdle';
        height = 25 + Math.random() * 10; // 高さもランダム
        width = 40 + Math.random() * 30;  // 幅もランダム
        depth = 10 + Math.random() * 10;
        color = '#f59e0b';
      } else if (randType < 0.66) {
        type = 'tunnel';
        height = 45; // 高い位置にある障害物の下をくぐる
        width = 80 + Math.random() * 40;
        depth = 30 + Math.random() * 20;
        color = '#a855f7'; // 紫
      } else {
        type = 'wall';
        height = 60 + Math.random() * 15; // 登るための高い壁
        width = 60 + Math.random() * 40;
        depth = 15 + Math.random() * 10;
        color = '#10b981'; // 緑
      }

      // 障害物のX座標：コースの範囲(-80〜80)内に、はみ出さないように配置
      const halfWidth = width / 2;
      const minX = -80 + halfWidth;
      const maxX = 80 - halfWidth;
      const x = minX + Math.random() * (maxX - minX);

      list.push({
        id: i,
        z: currentZ,
        x,
        width,
        height,
        depth,
        type,
        color,
      });
    }

    // 距離（Z）順にソート
    return list.sort((a, b) => a.z - b.z);
  };

  // ==========================================
  // ゲームスタート処理
  // ==========================================
  const handleStartGame = (stage: Stage) => {
    setSelectedStage(stage);
    setIsPaused(false);
    setCountdown(5); // 5秒のカウントダウンを開始
    setScreen('game');

    // ゲームモデルの初期化
    const obstacles = generateStageObstacles(stage);
    
    gameRef.current = {
      player: {
        x: -20, // スタート時に並走するため初期位置を変える
        y: 0,
        z: 0,
        vy: 0,
        state: 'running',
        width: 15,
        height: 30,
        grabTimer: 0,
        color: '#3b82f6',
      },
      cpu: {
        x: 20,
        y: 0,
        z: 0,
        vy: 0,
        state: 'running',
        width: 15,
        height: 30,
        grabTimer: 0,
        color: '#ec4899',
        currentTargetZ: 0,
        actionTimer: 0,
      },
      obstacles,
      startTime: Date.now(),
      elapsedTime: 0,
      courseLength: stage.length,
      roadWidth: 200,
      maxSpeed: 10 + stage.id * 1.2, // ステージが上がると基本速度上限がわずかに増加
      gravity: 0.6,
    };

    // ループ開始
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  // ==========================================
  // リスタート
  // ==========================================
  const handleRestart = () => {
    handleStartGame(selectedStage);
  };

  // ==========================================
  // ゲームメインループ (物理演算・状態判定・描画)
  // ==========================================
  const gameLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const game = gameRef.current;

    // ポーズ中およびカウントダウン中は物理と時間を停止して描画のみ実施
    if (!isPausedRef.current && countdownRef.current === 0) {
      game.elapsedTime = (Date.now() - game.startTime) / 1000;
      updatePhysics();
    } else if (countdownRef.current > 0) {
      game.elapsedTime = 0; // カウントダウン中は0s固定
    }

    drawGame(ctx, canvas);

    // ゴール到達判定
    if (game.player.z >= game.courseLength && game.player.state !== 'finished') {
      game.player.state = 'finished';
      handleGameClear();
      return;
    }

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  // ==========================================
  // 物理＆アクション判定
  // ==========================================
  const updatePhysics = () => {
    const game = gameRef.current;
    const player = game.player;
    const cpu = game.cpu;

    // --- 1. プレイヤーの移動制御 ---
    if (player.state !== 'finished') {
      // 進行：基本速度
      let forwardSpeed = game.maxSpeed;
      if (player.state === 'sliding') {
        forwardSpeed *= 0.85; // スライディング中は少し減速するが摩擦慣性はある
      } else if (player.state === 'ledge_grabbing') {
        forwardSpeed = 2; // よじ登り中は微量移動
      }
      player.z += forwardSpeed;

      // 左右移動 (キーボード入力優先、無ければバーチャルパッド)
      let sideInput = 0;
      if (keysPressed.current['a'] || keysPressed.current['arrowleft']) sideInput = -1;
      if (keysPressed.current['d'] || keysPressed.current['arrowright']) sideInput = 1;

      if (sideInput === 0 && mobileInput.current.dx !== 0) {
        sideInput = mobileInput.current.dx; // 仮想パッドからの入力
      }

      player.x += sideInput * 4.5;
      // 道幅制限 (-80〜80)
      player.x = Math.max(-80, Math.min(80, player.x));
    }

    // --- 2. プレイヤーのアクション（ジャンプ、落下、レッジグラブ）の処理 ---
    if (player.state === 'jumping') {
      player.y += player.vy;
      player.vy -= game.gravity;

      if (player.y <= 0) {
        player.y = 0;
        player.vy = 0;
        player.state = 'running';
      }
    } else if (player.state === 'ledge_grabbing') {
      player.grabTimer++;
      // 自動掴まりよじ登り（24フレームにわたるオートパルクールアクション）
      if (player.grabTimer < 12) {
        // 徐々に上に登る
        player.y += 3.5;
      } else if (player.grabTimer < 24) {
        // 前方へ飛び乗って復帰
        player.z += 4;
        player.y = Math.max(0, player.y - 1.5);
      } else {
        // 登りきってランニングに戻る
        player.state = 'running';
        player.height = 30;
        player.y = 0;
        player.grabTimer = 0;
      }
    }

    // --- 3. プレイヤーと障害物の衝突判定 ---
    // 進行方向（Z）に並ぶ障害物を探す
    for (const obs of game.obstacles) {
      // プレイヤーが障害物のZ位置に重なる瞬間を検知 (前後方向判定)
      const buffer = 15; // 判定厚みバッファ
      if (player.z >= obs.z - buffer && player.z <= obs.z + obs.depth + buffer) {
        
        // 左右（X）の重なり判定
        const pLeft = player.x - player.width / 2;
        const pRight = player.x + player.width / 2;
        const oLeft = obs.x - obs.width / 2;
        const oRight = obs.x + obs.width / 2;

        if (pRight >= oLeft && pLeft <= oRight) {
          // コンタクト発生！
          
          if (obs.type === 'hurdle') {
            // 『ジャンプ障害物（足場/ハードル）』
            // プレイヤーの足元の高さが障害物の高さを超えていない場合はぶつかる
            if (player.y < obs.height) {
              // 衝突ペナルティ：スピードダウン（Z進行を押し戻される）
              player.z = obs.z - buffer - 10;
              player.x += (player.x > obs.x ? 3 : -3); // 反発で少し弾かれる
            }
          } 
          else if (obs.type === 'tunnel') {
            // 『スライディング用 穴』：天井が高いので、しゃがんでいない（running）とぶつかる
            if (player.state !== 'sliding') {
              // ぶつかる（減速＆押し戻し）
              player.z = obs.z - buffer - 10;
            }
          } 
          else if (obs.type === 'wall') {
            // 『高い壁』
            // ぶつかったとき、もし上空（ジャンプ中）で「段差の縁（壁の上部25px以内）」に接触した場合：
            // 自動的に「レッジグラブ（端を掴んで登るアクション）」を発動
            if (player.state === 'jumping' && (player.y + player.height) >= obs.height && player.y < obs.height) {
              player.state = 'ledge_grabbing';
              player.y = obs.height - player.height; // 崖に足を掛ける初期位置
              player.vy = 0;
              player.grabTimer = 0;
            } else if (player.state !== 'ledge_grabbing') {
              // 地上からそのまま当たった場合：通り抜けられず押し戻される（登るにはジャンプして縁に接触する必要がある）
              player.z = obs.z - buffer - 10;
            }
          }
        }
      }
    }

    // --- 4. CPUの並走AI（難易度自動調整） ---
    if (cpu.state !== 'finished') {
      // ゴール到達
      if (cpu.z >= game.courseLength) {
        cpu.state = 'finished';
      }

      // **プレイヤーの強さに合わせた自動調整AI**
      // プレイヤーが前を進んでいる場合、CPUは速度を上げ、
      // プレイヤーが遅れている場合、プレイヤーを待つように速度を下げる
      const distToPlayer = player.z - cpu.z;
      let cpuTargetSpeed = game.maxSpeed;

      if (distToPlayer > 120) {
        // プレイヤーがはるか前方にいる：スピードブーストをかけて追ってくる
        cpuTargetSpeed = game.maxSpeed * 1.15;
      } else if (distToPlayer < -120) {
        // プレイヤーがはるか後方にいる：スピードを落としてデッドヒートを演出
        cpuTargetSpeed = game.maxSpeed * 0.8;
      } else {
        // ほぼ並走：本来の速さ
        cpuTargetSpeed = game.maxSpeed * (0.95 + Math.random() * 0.1);
      }

      // よじ登りやジャンプ中などアクション中の補正
      if (cpu.state === 'sliding') {
        cpuTargetSpeed *= 0.85;
      } else if (cpu.state === 'ledge_grabbing') {
        cpuTargetSpeed = 2;
      }

      cpu.z += cpuTargetSpeed;

      // プレイヤ位置と重ならないよう、少しズレて走る（並走感）
      const targetCpuX = player.x + (player.x > 0 ? -30 : 30);
      cpu.x += (targetCpuX - cpu.x) * 0.08;
      cpu.x = Math.max(-80, Math.min(80, cpu.x));

      // --- 4.2. CPUオートパルクールアクション判定 ---
      // CPUの足元にある（直前の）障害物情報を先読みして自動アクションを行う
      cpu.actionTimer++;
      const nextObs = game.obstacles.find(o => o.z > cpu.z && o.z < cpu.z + 180);
      
      if (nextObs && cpu.state === 'running') {
        // 左右重なりの判定
        const cLeft = cpu.x - cpu.width / 2;
        const cRight = cpu.x + cpu.width / 2;
        const oLeft = nextObs.x - nextObs.width / 2;
        const oRight = nextObs.x + nextObs.width / 2;

        if (cRight >= oLeft && cLeft <= oRight) {
          // 障害物の手前100〜130mで判断
          const distance = nextObs.z - cpu.z;
          if (distance < 120) {
            if (nextObs.type === 'hurdle') {
              // ジャンプ
              cpu.vy = 12;
              cpu.state = 'jumping';
              cpu.height = 30;
            } else if (nextObs.type === 'tunnel') {
              // スライディング
              cpu.state = 'sliding';
              cpu.height = 15;
              setTimeout(() => {
                if (cpu.state === 'sliding') {
                  cpu.state = 'running';
                  cpu.height = 30;
                }
              }, 800);
            } else if (nextObs.type === 'wall') {
              // 壁：まずジャンプして、壁際でレッジグラブに突入させる
              cpu.vy = 12.5;
              cpu.state = 'jumping';
            }
          }
        }
      }

      // CPUの空中＆よじ登り制御
      if (cpu.state === 'jumping') {
        cpu.y += cpu.vy;
        cpu.vy -= game.gravity;

        // もし途中で高い壁に当たったらレッジグラブ
        if (nextObs && nextObs.type === 'wall' && Math.abs(cpu.z - nextObs.z) < 18) {
          const cLeft = cpu.x - cpu.width / 2;
          const oLeft = nextObs.x - nextObs.width / 2;
          const oRight = nextObs.x + nextObs.width / 2;
          if (cpu.x >= oLeft - 10 && cpu.x <= oRight + 10) {
            if ((cpu.y + cpu.height) >= nextObs.height) {
              cpu.state = 'ledge_grabbing';
              cpu.y = nextObs.height - cpu.height;
              cpu.vy = 0;
              cpu.grabTimer = 0;
            }
          }
        }

        if (cpu.y <= 0) {
          cpu.y = 0;
          cpu.vy = 0;
          cpu.state = 'running';
        }
      } else if (cpu.state === 'ledge_grabbing') {
        cpu.grabTimer++;
        if (cpu.grabTimer < 12) {
          cpu.y += 3.5;
        } else if (cpu.grabTimer < 24) {
          cpu.z += 4;
          cpu.y = Math.max(0, cpu.y - 1.5);
        } else {
          cpu.state = 'running';
          cpu.height = 30;
          cpu.y = 0;
          cpu.grabTimer = 0;
        }
      }
    }
  };

  // ==========================================
  // 擬似3D 投影レンダリング描画
  // ==========================================
  const drawGame = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const game = gameRef.current;
    const player = game.player;
    const cpu = game.cpu;

    // --- 1. 背景の描画（空と遠景ビル群） ---
    // グラデーション空
    const skyGrad = ctx.createLinearGradient(0, 0, 0, height / 2);
    skyGrad.addColorStop(0, '#0f172a'); // 濃い紺
    skyGrad.addColorStop(1, '#1e293b'); // 暗灰色
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, width, height);

    // 遠くの夕焼け/サイバー光
    ctx.fillStyle = '#4f46e5';
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#6366f1';
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2 - 30, 200, 100, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // シャドウ解除

    // 遠くのビル群のシルエット
    ctx.fillStyle = '#111827';
    const bHeight = [80, 120, 100, 150, 90, 140, 70, 110];
    const bWidth = 50;
    for (let i = 0; i < width / bWidth + 2; i++) {
      const idx = i % bHeight.length;
      const bx = i * bWidth - (player.z * 0.05) % bWidth;
      ctx.fillRect(bx, height / 2 - bHeight[idx], bWidth - 2, bHeight[idx]);
    }

    // --- 2. 3D 遠近法投影関数 (Project3D) ---
    // プレイヤー中心のカメラ。Z軸を自車後ろ50、俯瞰高さ35に設定。
    const camZ = player.z - 110;
    const camY = player.y + 55;
    const camX = player.x;

    const project = (x3D: number, y3D: number, z3D: number) => {
      // カメラからの相対座標
      const rx = x3D - camX;
      const ry = y3D - camY;
      const rz = z3D - camZ;

      // 手前すぎる、あるいは背後のオブジェクトは除外
      if (rz <= 5) return null;

      // 遠近投影スケール
      const fov = 200; // 視野角
      const scale = fov / rz;

      // 画面上のXY
      const screenX = width / 2 + rx * scale;
      const screenY = height / 2 - ry * scale;

      return { x: screenX, y: screenY, scale };
    };

    // --- 3. 一本道の道路（コース）の描画 ---
    // Zのループをプレイヤー周辺に絞って描画する
    const step = 40;
    const maxViewZ = player.z + 550;
    const startViewZ = Math.max(0, player.z - 150);

    for (let z = Math.floor(startViewZ / step) * step; z < maxViewZ; z += step) {
      if (z > game.courseLength) break;

      const p1 = project(-80, 0, z);
      const p2 = project(80, 0, z);
      const p3 = project(80, 0, z + step);
      const p4 = project(-80, 0, z + step);

      if (p1 && p2 && p3 && p4) {
        // 色を交互に変えてグリッド感を出す
        ctx.fillStyle = ((z / step) % 2 === 0) ? '#1e293b' : '#334155';
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.closePath();
        ctx.fill();

        // 道路サイドの蛍光ライン（サイバーパルクール感）
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = Math.max(1, p1.scale * 0.5);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.stroke();
      }
    }

    // --- 4. 障害物の投影描画 ---
    // 描画順のためZソート
    const visibleObs = game.obstacles.filter(o => o.z > camZ && o.z < maxViewZ);
    for (const obs of visibleObs) {
      // 障害物の角の点を定義して3D空間の直方体をレンダリング
      const halfW = obs.width / 2;
      const hz = obs.z;
      const hDeltaZ = obs.depth;

      // 底面の4点
      const bLeftFront = project(obs.x - halfW, 0, hz);
      const bRightFront = project(obs.x + halfW, 0, hz);
      const bRightBack = project(obs.x + halfW, 0, hz + hDeltaZ);
      const bLeftBack = project(obs.x - halfW, 0, hz + hDeltaZ);

      // 上面の4点（高さを加算。トンネル型の場合は中空（くぐれる穴）の表現、その他は地面から生える構造）
      // トンネル型は上に高架ブロックを置く
      const structureY = obs.type === 'tunnel' ? 35 : 0;
      const tLeftFront = project(obs.x - halfW, obs.height + structureY, hz);
      const tRightFront = project(obs.x + halfW, obs.height + structureY, hz);
      const tRightBack = project(obs.x + halfW, obs.height + structureY, hz + hDeltaZ);
      const tLeftBack = project(obs.x - halfW, obs.height + structureY, hz + hDeltaZ);

      if (bLeftFront && bRightFront && tLeftFront && tRightFront && bRightBack && tRightBack && bLeftBack && tLeftBack) {
        
        ctx.shadowBlur = 10;
        ctx.shadowColor = obs.color;

        // 面ごとに塗りわけ
        // 1. 正面
        ctx.fillStyle = obs.color;
        ctx.beginPath();
        if (obs.type === 'tunnel') {
          // トンネルは、下に空間があるゲート形状に描画
          const gateTopFront = project(obs.x - halfW, structureY, hz);
          const gateTopBack = project(obs.x + halfW, structureY, hz);
          if (gateTopFront && gateTopBack) {
            ctx.moveTo(bLeftFront.x, bLeftFront.y);
            ctx.lineTo(gateTopFront.x, gateTopFront.y);
            // ゲートの柱
            ctx.lineTo(tLeftFront.x, tLeftFront.y);
            ctx.lineTo(tRightFront.x, tRightFront.y);
            ctx.lineTo(gateTopBack.x, gateTopBack.y);
            ctx.lineTo(bRightFront.x, bRightFront.y);
          }
        } else {
          ctx.moveTo(bLeftFront.x, bLeftFront.y);
          ctx.lineTo(bRightFront.x, bRightFront.y);
          ctx.lineTo(tRightFront.x, tRightFront.y);
          ctx.lineTo(tLeftFront.x, tLeftFront.y);
        }
        ctx.closePath();
        ctx.fill();

        // 2. 上面 (蓋)
        ctx.fillStyle = adjustBrightness(obs.color, 20); // 少し明るく
        ctx.beginPath();
        ctx.moveTo(tLeftFront.x, tLeftFront.y);
        ctx.lineTo(tRightFront.x, tRightFront.y);
        ctx.lineTo(tRightBack.x, tRightBack.y);
        ctx.lineTo(tLeftBack.x, tLeftBack.y);
        ctx.closePath();
        ctx.fill();

        // 3. 側面 (右)
        ctx.fillStyle = adjustBrightness(obs.color, -30); // 少し暗く
        ctx.beginPath();
        ctx.moveTo(bRightFront.x, bRightFront.y);
        ctx.lineTo(bRightBack.x, bRightBack.y);
        ctx.lineTo(tRightBack.x, tRightBack.y);
        ctx.lineTo(tRightFront.x, tRightFront.y);
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0; // 解除

        // ガイド文字/アイコンを障害物の手前に表示する
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(10, bLeftFront.scale * 0.5)}px sans-serif`;
        ctx.textAlign = 'center';
        let actionWord = "JUMP";
        if (obs.type === 'tunnel') actionWord = "SLIDE";
        if (obs.type === 'wall') actionWord = "CLIMB";
        ctx.fillText(actionWord, (bLeftFront.x + bRightFront.x) / 2, tLeftFront.y - 10);
      }
    }

    // --- 5. CPUの描画 ---
    if (cpu.z > camZ && cpu.z < maxViewZ) {
      const cProj = project(cpu.x, cpu.y, cpu.z);
      if (cProj) {
        drawCharacter(ctx, cProj.x, cProj.y, cProj.scale, cpu.color, cpu.state, "CPU");
      }
    }

    // --- 6. プレイヤーの描画 ---
    const pProj = project(player.x, player.y, player.z);
    if (pProj) {
      drawCharacter(ctx, pProj.x, pProj.y, pProj.scale, player.color, player.state, playerName);
    }

    // --- 7. UI（進行度、スピード、現在タイム）のオーバーレイ描画 ---
    // コース進行度バー (画面下部)
    const progress = Math.min(1, player.z / game.courseLength);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(20, height - 30, width - 40, 10);

    // CPUの進行マーク
    const cpuProgress = Math.min(1, cpu.z / game.courseLength);
    ctx.fillStyle = cpu.color;
    ctx.beginPath();
    ctx.arc(20 + (width - 40) * cpuProgress, height - 25, 6, 0, Math.PI * 2);
    ctx.fill();

    // プレイヤー進行マーク
    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.arc(20 + (width - 40) * progress, height - 25, 8, 0, Math.PI * 2);
    ctx.fill();

    // ゴールゲート表示
    const gateProjLeft = project(-80, 0, game.courseLength);
    const gateProjRight = project(80, 0, game.courseLength);
    const gateTop = project(-80, 100, game.courseLength);
    if (gateProjLeft && gateProjRight && gateTop) {
      ctx.strokeStyle = '#22c55e'; // 緑のゴールライン
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(gateProjLeft.x, gateProjLeft.y);
      ctx.lineTo(gateProjLeft.x, gateProjLeft.y - (gateProjLeft.scale * 0.8)); // 柱
      ctx.lineTo(gateProjRight.x, gateProjRight.y - (gateProjRight.scale * 0.8));
      ctx.lineTo(gateProjRight.x, gateProjRight.y);
      ctx.stroke();

      ctx.fillStyle = '#22c55e';
      ctx.font = `bold ${Math.max(12, gateProjLeft.scale * 0.4)}px sans-serif`;
      ctx.fillText("GOAL", (gateProjLeft.x + gateProjRight.x) / 2, gateProjLeft.y - (gateProjLeft.scale * 0.85));
    }
  };

  // キャラクター（プレイヤー/CPU）描画ヘルパー
  const drawCharacter = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    scale: number,
    color: string,
    state: string,
    label: string
  ) => {
    // スケールをベースにサイズ調節
    const ch = state === 'sliding' ? 12 * scale * 0.4 : 28 * scale * 0.4;
    const cw = 14 * scale * 0.4;

    ctx.shadowBlur = 12;
    ctx.shadowColor = color;

    // キャラクターのコアシルエット
    ctx.fillStyle = color;
    if (state === 'sliding') {
      // しゃがみスライド（横に伸びた楕円）
      ctx.beginPath();
      ctx.ellipse(sx, sy - ch / 2, cw * 1.4, ch, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (state === 'ledge_grabbing') {
      // 崖つかまり用のぶら下がった姿勢
      ctx.fillRect(sx - cw / 2, sy - ch, cw, ch);
      // つかまった手
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - cw / 2 - 2, sy - ch - 4, 4, 4);
      ctx.fillRect(sx + cw / 2 - 2, sy - ch - 4, 4, 4);
    } else {
      // 通常ランニング / 空中ジャンプ
      // 角丸長方形の胴体
      ctx.beginPath();
      ctx.roundRect(sx - cw / 2, sy - ch, cw, ch, 6);
      ctx.fill();

      // 頭部
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy - ch - 6, cw / 2 * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // ラベル（名前）
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.max(9, scale * 0.18)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, sx, sy - ch - 16);
  };

  // 色彩調整（濃淡）
  const adjustBrightness = (hex: string, percent: number): string => {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = Math.max(0, Math.min(255, R + percent));
    G = Math.max(0, Math.min(255, G + percent));
    B = Math.max(0, Math.min(255, B + percent));

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  };

  // ==========================================
  // ゲームクリア（ゴールイン処理＆ランキング保存）
  // ==========================================
  const handleGameClear = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    const finalTime = Math.round(gameRef.current.elapsedTime * 100) / 100;
    setLastClearTime(finalTime);

    // 現ランキングの取得と追加
    const currentList = { ...rankingsRef.current };
    const stageList = [...(currentList[selectedStageRef.current.id] || [])];

    // 新たなタイムレコードを作成して追加
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
    const newRecord: RankingRecord = {
      name: playerNameRef.current,
      time: finalTime,
      date: dateStr,
    };

    stageList.push(newRecord);
    // タイム順にソート (最も速い者が上)
    stageList.sort((a, b) => a.time - b.time);
    
    // 上位5名のみ保存
    const updatedList = stageList.slice(0, 7);
    currentList[selectedStageRef.current.id] = updatedList;

    setRankings(currentList);
    localStorage.setItem('parkour_rankings', JSON.stringify(currentList));

    // 個人ベストの更新チェック
    const prevBest = personalBestsRef.current[selectedStageRef.current.id] || 9999;
    if (finalTime < prevBest) {
      const updatedBests = { ...personalBestsRef.current, [selectedStageRef.current.id]: finalTime };
      setPersonalBests(updatedBests);
      localStorage.setItem('parkour_personal_bests', JSON.stringify(updatedBests));
      setIsNewRecord(true);
    } else {
      setIsNewRecord(false);
    }

    setScreen('result');
  };

  // ==========================================
  // ポーズ各種制御
  // ==========================================
  const handleResumeGame = () => {
    setIsPaused(false);
  };

  const handleBackToStageSelect = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setScreen('stage_select');
  };

  const handleBackToTitle = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setScreen('title');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 font-sans text-slate-100 p-4 select-none overflow-hidden">
      
      {/* ==========================================
          タイトル画面
          ========================================== */}
      {screen === 'title' && (
        <div id="title-screen" className="flex flex-col items-center max-w-xl text-center bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl relative w-full m-4">
          <div className="absolute top-4 right-4 flex items-center bg-slate-800 border border-slate-700 px-3 py-1 rounded-full text-xs">
            <User className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
            <span className="font-medium">{playerName}</span>
            <button 
              onClick={() => { setTempName(playerName); setShowNameEdit(true); }}
              className="ml-2 hover:text-blue-400 transition"
              id="edit-name-btn"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent mb-2">
            FREE_RUNNER 3D
          </h1>
          <p className="text-xs text-slate-400 tracking-widest uppercase mb-8">
            パルクール × アクションレース
          </p>

          <div className="flex flex-col gap-4 w-full">
            <button 
              onClick={() => setScreen('stage_select')}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-3.5 px-6 rounded-xl font-semibold transition shadow-lg shadow-blue-900/40 cursor-pointer text-sm"
              id="go-stage-select"
            >
              <Play className="w-4 h-4" />
              ステージ選択
            </button>
            <button 
              onClick={() => setScreen('time_record')}
              className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 py-3.5 px-6 rounded-xl font-semibold transition cursor-pointer text-sm"
              id="go-time-records"
            >
              <Award className="w-4 h-4" />
              ベスト記録・ランキング
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800 text-left w-full text-xs text-slate-500">
            <p className="font-semibold text-slate-400 mb-1">【操作方法】</p>
            <p>• PC: W,A,S,D(移動)、Space(ジャンプ)、Shift(スライディング)</p>
            <p>• スマホ: 仮想パッド(移動)、タップ(ジャンプ)、下フリック(スライディング)</p>
          </div>
        </div>
      )}

      {/* ==========================================
          名前変更モーダル/ダイアログ
          ========================================== */}
      {showNameEdit && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 max-w-sm w-full p-6 rounded-xl shadow-2xl">
            <h3 className="text-md font-bold text-center mb-4">ゲストプレイヤー名登録</h3>
            <input 
              type="text" 
              maxLength={10}
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-4 py-2 mb-4 text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="名前を入力..."
              id="player-name-input"
            />
            <button 
              onClick={handleSaveName}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 py-2.5 px-4 rounded-lg font-semibold text-sm transition"
              id="save-name-btn"
            >
              <Check className="w-4 h-4" />
              登録して開始
            </button>
          </div>
        </div>
      )}

      {/* ==========================================
          ステージ選択画面
          ========================================== */}
      {screen === 'stage_select' && (
        <div id="stage-select-screen" className="flex flex-col max-w-2xl bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full m-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">ステージ選択</h2>
            <button 
              onClick={handleBackToTitle}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition bg-slate-800 px-3 py-1.5 rounded-lg cursor-pointer"
              id="back-title-from-stage"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              タイトルに戻る
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {STAGES.map((stg) => {
              const best = personalBests[stg.id];
              return (
                <div 
                  key={stg.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-5 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-900/20 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-blue-400 font-mono">
                        STAGE {stg.id}
                      </span>
                      <span className="text-xs text-red-400 font-mono">{stg.difficulty}</span>
                    </div>
                    <h3 className="font-semibold text-md text-white mb-2">{stg.name}</h3>
                    <div className="text-xs text-slate-500 flex flex-col gap-1">
                      <span>全長: {stg.length} m / 障害物数: {stg.baseObstacles}</span>
                      {best ? (
                        <span className="text-emerald-400 font-medium">個人ベスト: {best} 秒</span>
                      ) : (
                        <span>自己ベスト: --秒</span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleStartGame(stg)}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-center py-2.5 rounded-lg font-semibold text-xs transition cursor-pointer"
                  >
                    レース開始
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==========================================
          タイム記録・ランキング画面
          ========================================== */}
      {screen === 'time_record' && (
        <div id="time-record-screen" className="flex flex-col max-w-2xl bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full m-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">他プレイヤーのランキング</h2>
            <button 
              onClick={handleBackToTitle}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition bg-slate-800 px-3 py-1.5 rounded-lg cursor-pointer"
              id="back-title-from-records"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              タイトルに戻る
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {STAGES.map((stg) => {
              const best = personalBests[stg.id];
              const playersRank = rankings[stg.id] || [];
              return (
                <div key={stg.id} className="bg-slate-950 border border-slate-800/80 rounded-xl p-4">
                  <div className="flex justify-between border-b border-slate-800 pb-2 mb-3">
                    <span className="font-semibold text-xs text-blue-400">{stg.name}</span>
                    {best && <span className="text-xs text-emerald-400 font-mono">Myベスト: {best}s</span>}
                  </div>

                  <div className="flex flex-col gap-2">
                    {playersRank.length > 0 ? (
                      playersRank.map((record, index) => {
                        const isCurrentPlayer = record.name === playerName;
                        return (
                          <div 
                            key={index} 
                            className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${isCurrentPlayer ? 'bg-blue-900/30 text-blue-200 border border-blue-500/20' : 'text-slate-400'}`}
                          >
                            <span className="font-semibold">{index + 1}位. {record.name}</span>
                            <span className="font-mono">{record.time} 秒</span>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-500 text-center py-4">記録なし</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==========================================
          ゲーム画面
          ========================================== */}
      {screen === 'game' && (
        <div id="game-container" className="relative flex flex-col items-center justify-center w-full max-w-4xl bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
          
          {/* キャンバス */}
          <canvas 
            ref={canvasRef} 
            width={640} 
            height={360} 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="w-full h-auto aspect-[16/9] block bg-slate-900" 
          />

          {/* カウントダウン表示 */}
          {countdown > 0 && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none z-10 transition-all duration-300">
              <div className="text-center">
                <div className="text-8xl font-black text-yellow-500 tracking-wider animate-bounce drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
                  {countdown}
                </div>
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-widest mt-4">
                  READY
                </div>
              </div>
            </div>
          )}

          {/* ゲームオーバーレイ情報 */}
          <div className="absolute top-4 left-4 flex gap-4 pointer-events-none text-slate-200">
            <div className="bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800/60 text-xs">
              タイム: <span className="font-mono text-blue-400 font-bold">{gameRef.current.elapsedTime.toFixed(2)}s</span>
            </div>
            <div className="bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800/60 text-xs text-emerald-400 font-bold">
              プレイヤー: {playerName}
            </div>
            <div className="bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800/60 text-xs text-pink-400 font-bold">
              CPU
            </div>
          </div>

          {/* ポーズボタン */}
          <button 
            onClick={() => setIsPaused(true)}
            className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-850 p-2 rounded-lg border border-slate-800/60 transition cursor-pointer text-slate-200"
            id="pause-button"
          >
            <Pause className="w-4 h-4" />
          </button>

          {/* モバイル用バーチャルスティック＆ジャンプの解説 */}
          <div className="absolute bottom-10 left-0 right-0 pointer-events-none flex justify-between px-8 text-[11px] text-slate-400/80 md:hidden">
            <div>← ドラッグで横移動 →</div>
            <div>下フリック：スライディング / タップ：ジャンプ</div>
          </div>

          {/* ==========================================
              ポーズモーダル
              ========================================== */}
          {isPaused && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-40">
              <div id="pause-menu" className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-sm w-full text-center">
                <h3 className="text-lg font-bold mb-6 text-slate-200">ゲーム一時停止</h3>
                <div className="flex flex-col gap-3">
                  <button 
                    onClick={handleResumeGame}
                    className="bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-semibold text-xs transition cursor-pointer"
                    id="resume-btn"
                  >
                    ゲームに戻る
                  </button>
                  <button 
                    onClick={handleRestart}
                    className="bg-slate-800 hover:bg-slate-700 py-3 rounded-lg font-semibold text-xs transition cursor-pointer"
                    id="restart-btn"
                  >
                    リスタート
                  </button>
                  <button 
                    onClick={handleBackToStageSelect}
                    className="bg-slate-800 hover:bg-slate-700 py-3 rounded-lg font-semibold text-xs transition cursor-pointer"
                    id="back-stages-btn"
                  >
                    ステージ選択に戻る
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          タイム、ランキング（リザルト画面）
          ========================================== */}
      {screen === 'result' && (
        <div id="result-screen" className="flex flex-col max-w-lg bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full m-4">
          <div className="text-center mb-6">
            <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-400 bg-emerald-900/20 border border-emerald-500/20 px-2.5 py-1 rounded-full">
              STAGE CLEAR!
            </span>
            <h2 className="text-2xl font-bold mt-3 mb-1 text-slate-100">{selectedStage.name}</h2>
            <p className="text-xs text-slate-500">お疲れ様でした！</p>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-6 rounded-xl text-center mb-6">
            <div className="text-xs text-slate-400 mb-1">今回のクリアタイム</div>
            <div className="text-3xl font-extrabold text-blue-400 font-mono">
              {lastClearTime} <span className="text-sm font-normal">秒</span>
            </div>
            {isNewRecord && (
              <div className="inline-block mt-2 text-[10px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30">
                ★ 自己ベスト更新! ★
              </div>
            )}
          </div>

          {/* 進捗・ランキングボード */}
          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4 mb-6">
            <div className="text-xs font-semibold text-slate-400 mb-3 text-center">サーバー同期リーダーボード</div>
            <div className="flex flex-col gap-2">
              {(rankings[selectedStage.id] || []).map((record, index) => {
                const isCurrentPlayer = record.name === playerName && record.time === lastClearTime;
                return (
                  <div 
                    key={index} 
                    className={`flex items-center justify-between text-xs py-1.5 px-3 rounded ${isCurrentPlayer ? 'bg-blue-900/40 text-blue-200 border border-blue-500/30' : 'text-slate-400'}`}
                  >
                    <span className="font-semibold">{index + 1}位. {record.name}</span>
                    <span className="font-mono">{record.time} 秒</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={handleBackToTitle}
              className="flex-1 bg-slate-800 hover:bg-slate-705 text-center py-3 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              id="back-title-btn"
            >
              <Home className="w-3.5 h-3.5" />
              タイトル
            </button>
            <button 
              onClick={handleBackToStageSelect}
              className="flex-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-center py-3 rounded-lg font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              id="back-stages-from-result-btn"
            >
              <Play className="w-3.5 h-3.5" />
              ステージ選択
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
