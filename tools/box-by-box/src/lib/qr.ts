// The shareable link as a QR code, so a class can point their phones at the
// board instead of typing a long address.
//
// The encoding itself comes from `qrcode-generator` — the QR spec's Reed-Solomon
// codes, version sizing and mask selection are far more than a few hundred lines
// to reproduce, and a subtly wrong QR is one that simply refuses to scan.
// Everything below is only about turning its grid of modules into something to
// look at or paste.

import qrcode from 'qrcode-generator';

// Blank margin around the code, in modules. Scanners need it to find the edges;
// four is what the spec asks for.
const QUIET = 4;

export interface Qr {
	/** Modules per side, not counting the quiet zone. */
	count: number;
	dark: (row: number, col: number) => boolean;
}

export function makeQr(text: string): Qr {
	// Type 0 picks the smallest version the text fits into. Medium error
	// correction survives a phone camera at an angle without inflating the code.
	const code = qrcode(0, 'M');
	code.addData(text);
	code.make();
	return { count: code.getModuleCount(), dark: (r, c) => code.isDark(r, c) };
}

/** Width of the drawing in modules, quiet zone included. */
export function qrExtent(qr: Qr): number {
	return qr.count + QUIET * 2;
}

/** Every dark module as one SVG path, so the code draws as a single shape. */
export function qrPath(qr: Qr): string {
	let d = '';
	for (let r = 0; r < qr.count; r++) {
		for (let c = 0; c < qr.count; c++) {
			if (qr.dark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
		}
	}
	return d;
}

/**
 * The same code as a PNG, which is the one image format clipboards agree on.
 * Drawn large enough to stay sharp pasted into a slide or printed on a handout.
 */
export function qrPng(qr: Qr, modulePixels = 10): Promise<Blob> {
	const side = qrExtent(qr) * modulePixels;
	const canvas = document.createElement('canvas');
	canvas.width = side;
	canvas.height = side;

	const ctx = canvas.getContext('2d');
	if (!ctx) return Promise.reject(new Error('Could not draw the QR code'));

	// A QR needs a light background to scan; transparency would leave it to
	// whatever the code is pasted onto.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, side, side);
	ctx.fillStyle = '#000000';
	for (let r = 0; r < qr.count; r++) {
		for (let c = 0; c < qr.count; c++) {
			if (qr.dark(r, c)) {
				ctx.fillRect(
					(c + QUIET) * modulePixels,
					(r + QUIET) * modulePixels,
					modulePixels,
					modulePixels
				);
			}
		}
	}

	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the QR code'))),
			'image/png'
		)
	);
}
