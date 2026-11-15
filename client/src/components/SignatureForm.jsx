// Draw-a-signature pad (smoothed strokes, baseline guide) + signer details.
// Used by YMT staff and by clients on the public signing page. Signing is irreversible → confirmation dialog.

import { useRef, useState } from 'react';
import { PenLine, Eraser } from 'lucide-react';
import { Button, ErrorBox, useConfirm } from '../ui/index.js';
import { INPUT_CLASS } from './EntityForm.jsx';
import { useAction } from '../hooks/useApi.js';

const STROKE_COLOR = '#0F2A4A'; // ink on the always-white pad, in both themes (the PNG must print well)

function SignaturePad({ canvasRef, onDraw, label }) {
  const points = useRef([]);

  function toCanvasPoint(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasRef.current.height,
    };
  }

  function start(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    points.current = [toCanvasPoint(event)];
  }

  // Quadratic curves through midpoints give a smooth, pen-like line instead of jagged segments.
  function move(event) {
    if (points.current.length === 0) return;
    const context = canvasRef.current.getContext('2d');
    const next = toCanvasPoint(event);
    const [previous] = points.current.slice(-1);
    const [beforePrevious] = points.current.length > 1 ? points.current.slice(-2, -1) : [previous];
    const midStart = { x: (beforePrevious.x + previous.x) / 2, y: (beforePrevious.y + previous.y) / 2 };
    const midEnd = { x: (previous.x + next.x) / 2, y: (previous.y + next.y) / 2 };
    context.strokeStyle = STROKE_COLOR;
    context.lineWidth = 2.6;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(midStart.x, midStart.y);
    context.quadraticCurveTo(previous.x, previous.y, midEnd.x, midEnd.y);
    context.stroke();
    points.current.push(next);
    onDraw();
  }

  function end() {
    points.current = [];
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        role="img"
        aria-label={label}
        className="block w-full touch-none rounded-[10px] border-2 border-dashed border-line-strong bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 bottom-10 flex items-end gap-2 border-b border-slate-300 text-slate-400">
        <PenLine size={14} className="mb-1" />
      </div>
    </div>
  );
}

/**
 * @param {{ labels: Record<string,string>, onSign: (payload) => Promise<unknown>, askEmail?: boolean, defaultName?: string }} props
 * labels: name, email, drawHere, consent, sign, signing, clear, confirmTitle, confirmBody
 */
export function SignatureForm({ labels, onSign, askEmail = false, defaultName = '' }) {
  const canvasRef = useRef(null);
  const confirm = useConfirm();
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const submit = useAction(onSign);

  function clear() {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  const missing = !name ? labels.name : !hasInk ? labels.drawHere : !agreed ? labels.consent : null;

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const ok = await confirm({ title: labels.confirmTitle, body: labels.confirmBody, confirmLabel: labels.sign, tone: 'success' });
        if (ok) await submit.run({ signer_name: name, signer_email: email || null, signature_image: canvasRef.current.toDataURL('image/png') });
      }}
    >
      <ErrorBox message={submit.error} />
      <label className="block text-sm font-medium">{labels.name}
        <input className={`${INPUT_CLASS} mt-1.5 border-line-strong`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </label>
      {askEmail && (
        <label className="block text-sm font-medium">{labels.email}
          <input type="email" dir="ltr" className={`${INPUT_CLASS} mt-1.5 border-line-strong`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
      )}
      <div>
        <div className="mb-1.5 text-sm font-medium">{labels.drawHere}</div>
        <SignaturePad canvasRef={canvasRef} onDraw={() => setHasInk(true)} label={labels.drawHere} />
      </div>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--success)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        {labels.consent}
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="success" icon={PenLine} loading={submit.busy} loadingLabel={labels.signing} disabled={missing !== null} disabledReason={missing ?? undefined}>
          {labels.sign}
        </Button>
        <Button variant="secondary" icon={Eraser} offlineOk onClick={clear} disabled={!hasInk}>{labels.clear}</Button>
      </div>
    </form>
  );
}

export function SignatureList({ signatures, labels, formatDate }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {signatures.map((signature) => (
        <figure key={`${signature.signer_name}-${signature.signed_at}`} className="animate-rise rounded-[10px] border border-line bg-white p-3">
          <img src={signature.signature_image} alt={signature.signer_name} className="h-20 w-full object-contain opacity-90" />
          <figcaption className="mt-2 border-t border-slate-200 pt-2 text-[13px] text-slate-600">
            <bdi className="font-medium text-slate-800">{signature.signer_name}</bdi> · {labels[signature.signer_role]} · {formatDate(signature.signed_at)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
