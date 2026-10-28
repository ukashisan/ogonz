// Draws the side-view house and its Ogonz onto a 2D canvas in world units.

import { WORLD, FLOORS, FLOOR_H, HOUSE, STAIRS, DOOR_X, EXIT_X, CATALOG } from './data.js';
import { clock, mood, isSleeping, byId } from './sim.js';

const ROOF_Y = FLOORS[1] - FLOOR_H;
const WALLPAPER = ['#f3e9d2', '#e3eef5'];

export function ogonPosition(o) {
  if (!o.climb) return { x: o.x, y: FLOORS[o.floor] };
  const t = o.climb.t;
  return { x: STAIRS.x, y: FLOORS[o.climb.from] + (FLOORS[o.climb.to] - FLOORS[o.climb.from]) * t };
}

export function draw(ctx, s, view) {
  const c = clock(s);
  drawSky(ctx, c.hourF);
  drawGround(ctx);
  drawHouse(ctx, c.hourF);

  for (const obj of s.objects) drawObject(ctx, obj.type, obj.x, FLOORS[obj.floor], 1, obj.user !== null);
  if (view.ghost) {
    drawObject(ctx, view.ghost.type, view.ghost.x, FLOORS[view.ghost.floor], 0.55, false);
    if (!view.ghost.ok) {
      const cat = CATALOG[view.ghost.type];
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(view.ghost.x - cat.w / 2, FLOORS[view.ghost.floor] - cat.h, cat.w, cat.h);
    }
  }
  if (view.cursorId) {
    const obj = byId(s.objects, view.cursorId);
    if (obj) outlineObject(ctx, obj, '#ffd43b');
  }
  if (view.sellId) {
    const obj = byId(s.objects, view.sellId);
    if (obj) outlineObject(ctx, obj, '#ff6b6b');
  }

  for (const o of s.ogonz) if (!o.away) drawOgon(ctx, s, o, o.id === view.selectedId, view.time);
}

// ---------- scenery ----------

function drawSky(ctx, hour) {
  // Dawn 5-7, dusk 19-21.
  const c01 = v => Math.max(0, Math.min(1, v));
  const light = c01((hour - 5) / 2) * c01((21 - hour) / 2);
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.h);
  g.addColorStop(0, mix('#0b1026', '#6cb4ee', light));
  g.addColorStop(1, mix('#28305a', '#cfe9ff', light));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  if (light < 0.3) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 30; i++) ctx.fillRect((i * 97) % WORLD.w, (i * 53) % ROOF_Y, 1.5, 1.5);
  }
}

function drawGround(ctx) {
  ctx.fillStyle = '#5c9e4a';
  ctx.fillRect(0, FLOORS[0], WORLD.w, WORLD.h - FLOORS[0]);
  ctx.fillStyle = '#7a5a3a';
  ctx.fillRect(0, FLOORS[0] + 10, WORLD.w, WORLD.h - FLOORS[0]);
  // Bus stop
  ctx.fillStyle = '#555';
  ctx.fillRect(EXIT_X - 2, FLOORS[0] - 60, 4, 60);
  ctx.fillStyle = '#1c7ed6';
  ctx.fillRect(EXIT_X - 14, FLOORS[0] - 72, 28, 18);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('BUS', EXIT_X, FLOORS[0] - 59);
}

function drawHouse(ctx, hour) {
  const { left, right } = HOUSE;
  // Roof
  ctx.fillStyle = '#8c3b2e';
  ctx.beginPath();
  ctx.moveTo(left - 16, ROOF_Y);
  ctx.lineTo((left + right) / 2, ROOF_Y - 50);
  ctx.lineTo(right + 16, ROOF_Y);
  ctx.closePath();
  ctx.fill();
  // Rooms
  for (let f = 0; f < FLOORS.length; f++) {
    const top = FLOORS[f] - FLOOR_H;
    ctx.fillStyle = WALLPAPER[f];
    ctx.fillRect(left, top, right - left, FLOOR_H);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = left; x < right; x += 24) ctx.fillRect(x, top, 12, FLOOR_H);
    // Window
    const night = hour < 6 || hour >= 20;
    ctx.fillStyle = night ? '#1b2340' : '#bfe3ff';
    ctx.fillRect(left + 260, top + 30, 60, 46);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(left + 260, top + 30, 60, 46);
    ctx.beginPath();
    ctx.moveTo(left + 290, top + 30);
    ctx.lineTo(left + 290, top + 76);
    ctx.stroke();
    // Floor slab
    ctx.fillStyle = '#9b7653';
    ctx.fillRect(left, FLOORS[f], right - left, 8);
  }
  // Outer walls
  ctx.fillStyle = '#6b4f3a';
  ctx.fillRect(left - 6, ROOF_Y, 6, FLOORS[0] - ROOF_Y + 8);
  ctx.fillRect(right, ROOF_Y, 6, FLOORS[0] - ROOF_Y + 8);
  // Front door (an opening in the wall)
  ctx.fillStyle = '#c08552';
  ctx.fillRect(DOOR_X - 6, FLOORS[0] - 64, 6, 64);
  // Stairwell
  const sx = STAIRS.x - STAIRS.w / 2;
  ctx.fillStyle = '#d9c7a7';
  ctx.fillRect(sx, FLOORS[1] - FLOOR_H, STAIRS.w, FLOORS[0] - FLOORS[1] + FLOOR_H);
  ctx.fillStyle = '#a07d55';
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const y = FLOORS[0] - (i + 1) * (FLOORS[0] - FLOORS[1]) / steps;
    const x = i % 2 ? sx + 6 : sx + STAIRS.w / 2;
    ctx.fillRect(x, y, STAIRS.w / 2 - 6, 5);
  }
  ctx.fillStyle = '#9b7653';
  ctx.fillRect(sx, FLOORS[1], 8, 8);
}

// ---------- furniture ----------

export function drawObject(ctx, type, x, base, alpha, inUse) {
  const cat = CATALOG[type];
  const l = x - cat.w / 2, top = base - cat.h, w = cat.w, h = cat.h;
  ctx.save();
  ctx.globalAlpha = alpha;
  switch (type) {
    case 'fridge':
      box(ctx, l, top, w, h, '#e9ecef', '#adb5bd');
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(l, top + h * 0.35, w, 2);
      ctx.fillRect(l + w - 8, top + 8, 3, 14);
      ctx.fillRect(l + w - 8, top + h * 0.45, 3, 18);
      break;
    case 'bed':
      box(ctx, l, base - 18, w, 18, '#8d6e63', '#6d4c41');
      box(ctx, l, top, 10, h, '#6d4c41');
      box(ctx, l + 10, base - 26, w - 10, 9, '#74c0fc', '#4dabf7');
      box(ctx, l + 12, base - 30, 18, 8, '#fff', '#ced4da');
      break;
    case 'toilet':
      box(ctx, l + 14, top, 14, 20, '#f8f9fa', '#ced4da');
      box(ctx, l + 2, base - 18, 26, 8, '#f8f9fa', '#ced4da');
      box(ctx, l + 8, base - 10, 12, 10, '#f8f9fa', '#ced4da');
      break;
    case 'shower':
      box(ctx, l, top, w, h, 'rgba(165,216,255,0.45)', '#74c0fc');
      ctx.fillStyle = '#868e96';
      ctx.fillRect(x - 2, top + 4, 4, 10);
      ctx.fillRect(x - 8, top + 14, 16, 3);
      if (inUse) {
        ctx.fillStyle = 'rgba(77,171,247,0.6)';
        for (let i = 0; i < 5; i++) ctx.fillRect(x - 7 + i * 3, top + 20, 1.5, h - 24);
      }
      break;
    case 'tv':
      box(ctx, l + 4, base - 16, w - 8, 16, '#8d6e63', '#6d4c41');
      box(ctx, l, top, w, 28, '#212529');
      ctx.fillStyle = inUse ? '#63e6be' : '#343a40';
      ctx.fillRect(l + 3, top + 3, w - 6, 22);
      break;
    case 'sofa':
      box(ctx, l, base - 22, w, 16, '#e599f7', '#be4bdb');
      box(ctx, l, top, w, 14, '#da77f2', '#be4bdb');
      box(ctx, l - 2, base - 26, 8, 20, '#be4bdb');
      box(ctx, l + w - 6, base - 26, 8, 20, '#be4bdb');
      break;
    case 'bookshelf':
      box(ctx, l, top, w, h, '#a0785a', '#7a5a3a');
      for (let r = 0; r < 4; r++) {
        const y = top + 4 + r * 19;
        for (let b = 0; b < 6; b++) {
          ctx.fillStyle = ['#e03131', '#1971c2', '#2f9e44', '#f08c00', '#7048e8', '#495057'][(b + r) % 6];
          ctx.fillRect(l + 4 + b * 6, y + 2, 5, 14);
        }
      }
      break;
    case 'plant':
      box(ctx, l + 4, base - 14, w - 8, 14, '#d9480f');
      ctx.fillStyle = '#2b8a3e';
      ctx.beginPath();
      ctx.ellipse(x, base - 26, 11, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

function outlineObject(ctx, obj, color) {
  const cat = CATALOG[obj.type];
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(obj.x - cat.w / 2 - 3, FLOORS[obj.floor] - cat.h - 3, cat.w + 6, cat.h + 6);
  ctx.setLineDash([]);
}

function box(ctx, x, y, w, h, fill, stroke) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
  }
}

// ---------- Ogonz ----------

export const OGON_SCALE = 1.3;

function drawOgon(ctx, s, o, selected, time) {
  const pos = ogonPosition(o);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.scale(OGON_SCALE, OGON_SCALE);
  drawOgonAt(ctx, s, o, selected, time, 0, 0);
  ctx.restore();
}

function drawOgonAt(ctx, s, o, selected, time, x, y) {
  const sleeping = isSleeping(s, o);
  const step = o.plan && o.plan.steps[0];
  const walking = step && (step.type === 'goto' || step.type === 'approach') || o.climb;
  const bob = walking ? Math.abs(Math.sin(time * 10)) * 2 : 0;

  if (selected) {
    ctx.fillStyle = 'rgba(255,212,59,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  if (sleeping) {
    const bed = step.type === 'use' ? byId(s.objects, step.objectId) : null;
    // Lie down on the mattress (or the floor when passed out), head on the pillow.
    ctx.translate(x + 22, y - (bed ? 20 : 2) / OGON_SCALE);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-x, -y);
  }
  // Legs
  ctx.fillStyle = '#343a40';
  const swing = walking ? Math.sin(time * 10) * 3 : 0;
  ctx.fillRect(x - 5 + swing, y - 9, 4, 9);
  ctx.fillRect(x + 1 - swing, y - 9, 4, 9);
  // Body
  ctx.fillStyle = o.color;
  roundRect(ctx, x - 8, y - 27 - bob, 16, 19, 6);
  ctx.fill();
  // Head
  ctx.fillStyle = '#f1d3b3';
  ctx.beginPath();
  ctx.arc(x, y - 34 - bob, 8, 0, Math.PI * 2);
  ctx.fill();
  // Eyes
  ctx.fillStyle = '#212529';
  if (sleeping) {
    ctx.fillRect(x - 4, y - 35 - bob, 3, 1);
    ctx.fillRect(x + 2, y - 35 - bob, 3, 1);
  } else {
    const f = o.facing || 1;
    ctx.fillRect(x + f * 2 - 1, y - 36 - bob, 2, 3);
    ctx.fillRect(x + f * 5 - 1, y - 36 - bob, 2, 3);
  }
  ctx.restore();

  const headTop = sleeping ? y - 52 : y - 46 - bob;
  // Mood diamond
  const m = mood(o);
  ctx.fillStyle = `hsl(${Math.round(m * 1.2)}, 80%, 48%)`;
  ctx.beginPath();
  ctx.moveTo(x, headTop - 14);
  ctx.lineTo(x + 5, headTop - 7);
  ctx.lineTo(x, headTop);
  ctx.lineTo(x - 5, headTop - 7);
  ctx.closePath();
  ctx.fill();

  // Activity hint
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#212529';
  if (sleeping) ctx.fillText(Math.floor(time * 2) % 2 ? 'z Z' : 'Z z', x + 8, headTop - 4);
  else if (step && step.type === 'chatting') bubble(ctx, x + 6, headTop - 10, Math.floor(time * 3) % 2 ? '…' : '!');

  // Name
  ctx.font = (selected ? 'bold ' : '') + '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.strokeText(o.name, x, y + 12);
  ctx.fillStyle = '#212529';
  ctx.fillText(o.name, x, y + 12);
}

function bubble(ctx, x, y, text) {
  ctx.fillStyle = '#fff';
  roundRect(ctx, x, y - 12, 16, 13, 5);
  ctx.fill();
  ctx.fillStyle = '#212529';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + 8, y - 2);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = sh => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
