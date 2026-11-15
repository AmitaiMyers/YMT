// Draw-a-signature pad + signer details. Used by YMT staff and by clients on the public signing page.

import { useRef, useState } from 'react';
import { Button, ErrorBox } from './ui.jsx';
import { INPUT_CLASS } from './EntityForm.jsx';
import { useAction } from '../hooks/useApi.js';

function SignaturePad({ canvasRef, onDraw }) {
  const drawing = useRef(false);

  function point(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((event.clientY - rect.top) / rect.height) * canvasRef.current.height,
    };
  }

  function start(event) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const context = canvasRef.current.getContext('2d');
    const { x, y } = point(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function move(event) {
    if (!drawing.current) return;
    const context = canvasRef.current.getContext('2d');
    context.lineWidth = 2.5;
    context.lineCap = 'round';
    context.strokeStyle = '#0f2a4a';
    const { x, y } = point(event);
    context.lineTo(x, y);
    context.stroke();
    onDraw();
  }

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={180}
      className="w-full touch-none rounded-md border-2 border-dashed border-slate-300 bg-white"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={() => { drawing.current = false; }}
      onPointerLeave={() => { drawing.current = false; }}
    />
  );
}

/**
 * @param {{ labels: Record<string,string>, onSign: (payload) => Promise<unknown>, askEmail?: boolean, defaultName?: string }} props
 */
export function SignatureForm({ labels, onSign, askEmail = false, defaultName = '' }) {
  const canvasRef = useRef(null);
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

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit.run({ signer_name: name, signer_email: email || null, signature_image: canvasRef.current.toDataURL('image/png') });
      }}
    >
      <ErrorBox message={submit.error} />
      <label className="block text-sm">{labels.name}
        <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      {askEmail && (
        <label className="block text-sm">{labels.email}
          <input type="email" className={INPUT_CLASS} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      )}
      <div>
        <div className="mb-1 text-sm">{labels.drawHere}</div>
        <SignaturePad canvasRef={canvasRef} onDraw={() => setHasInk(true)} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        {labels.consent}
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="success" disabled={!hasInk || !agreed || !name || submit.busy}>{labels.sign}</Button>
        <Button variant="secondary" onClick={clear}>{labels.clear}</Button>
      </div>
    </form>
  );
}

export function SignatureList({ signatures, labels, formatDate }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {signatures.map((signature) => (
        <figure key={`${signature.signer_name}-${signature.signed_at}`} className="rounded-md border border-slate-200 p-3">
          <img src={signature.signature_image} alt={signature.signer_name} className="h-20 w-full object-contain" />
          <figcaption className="mt-2 text-xs text-slate-600">
            {signature.signer_name} · {labels[signature.signer_role]} · {formatDate(signature.signed_at)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
