// src/lib/confirmationEmail.tsx
import type { Course, User } from '@prisma/client';

export type EmailCourse = Pick<Course, 'title' | 'type' | 'week' | 'price'>;
export type EmailUser = Pick<User, 'names' | 'lastNames' | 'rut' | 'email'>;

export interface ConfirmationEmailInput {
  id: string;
  courses: EmailCourse[];
  /** Omitted when the buyer row is unavailable; the identity rows are then skipped. */
  user?: EmailUser | null;
}

// Luz design tokens, hard-coded: an email cannot read globals.css, and CSS custom
// properties are unsupported by Outlook and stripped by Gmail.
const COLOR = {
  page: '#f4f7f6',
  card: '#ffffff',
  border: '#e1eae8',
  foreground: '#0a3b3b',
  muted: '#5d716e',
  primary: '#0f6e6e',
  accent: '#e3f1ed',
} as const;

// Web fonts do not load in most clients, so the display/mono families of the site
// degrade to the nearest system stack rather than to whatever the client defaults to.
const FONT_SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONT_MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono',monospace";

const SITE_URL = 'https://ccem.cl/';
const CONTACT_EMAIL = 'contacto@ccem.cl';

// Course titles, names and RUTs are user- or admin-supplied strings that land in
// markup, so they are escaped rather than interpolated raw.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** One label/value line of the receipt card, mirroring <Row /> in buyInfo.tsx. */
function renderRow(label: string, value: string, isLast: boolean): string {
  const border = isLast ? 'none' : `1px solid ${COLOR.border}`;
  return `<tr>
                  <td style="padding:10px 0;border-bottom:${border};font-family:${FONT_SANS};font-size:14px;line-height:20px;color:${COLOR.muted};" align="left" valign="top">${escapeHtml(label)}</td>
                  <td style="padding:10px 0 10px 16px;border-bottom:${border};font-family:${FONT_SANS};font-size:14px;line-height:20px;font-weight:600;color:${COLOR.foreground};" align="right" valign="top">${escapeHtml(value)}</td>
                </tr>`;
}

/**
 * Server-side replacement for the legacy <EmailConfirmation /> React component
 * (which the old frontend rendered with ReactDOMServer.renderToStaticMarkup and
 * POSTed to the API). The monolith builds the email HTML here, server-side, so
 * the client never renders or ships email markup. Called from
 * sendPurchaseConfirmation (src/lib/purchaseEmail.ts) and re-exported by the
 * Phase 9 mailConfirmation component.
 *
 * The markup is a nested-table layout with fully inline styles — the only thing
 * Outlook, Gmail and Apple Mail all render alike. It reproduces the /confirmation
 * page: heading, order number, the "Tu inscripción" card, and the footer.
 */
export function buildConfirmationEmailHtml({ id, courses, user }: ConfirmationEmailInput): string {
  const price = courses.reduce((sum, course) => sum + course.price, 0);

  // Same grouping as BuyInfo so the email and the page never disagree about what
  // the buyer got.
  const generalCourses = courses.filter((course) => course.type === 'core');
  const moduleCourse = courses.find((course) => course.type === 'elective');
  const workshops = courses.filter((course) => course.type === 'workshop');

  const entries: Array<[string, string]> = [
    ...generalCourses.map((course): [string, string] => ['Módulo general', course.title]),
    ...(moduleCourse ? [['Módulo sincrónico', moduleCourse.title] as [string, string]] : []),
    ...workshops.map((workshop, index): [string, string] => [
      `Workshop ${index + 1}`,
      workshop.title,
    ]),
    ['Precio', `$${price}`],
    ...(user
      ? ([
          ['Nombre', `${user.names} ${user.lastNames}`],
          ['RUT', user.rut],
          ['Correo', user.email],
        ] as Array<[string, string]>)
      : []),
  ];

  const rows = entries
    .map(([label, value], index) => renderRow(label, value, index === entries.length - 1))
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Confirmación de Orden</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.page};">
  <!-- Inbox preview line; hidden in the body itself. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Tu inscripción al Congreso CCEM UC está confirmada. Orden ${escapeHtml(id)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td style="padding-bottom:8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="28" style="padding-right:12px;" valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="28" style="width:28px;height:28px;border-radius:14px;background-color:${COLOR.accent};">
                      <tr><td align="center" valign="middle" style="font-family:${FONT_SANS};font-size:16px;line-height:28px;color:${COLOR.primary};">&#10003;</td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="font-family:${FONT_SANS};font-size:24px;line-height:32px;font-weight:700;color:${COLOR.foreground};">Confirmación de Orden</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;font-family:${FONT_SANS};font-size:15px;line-height:24px;color:${COLOR.muted};">
              Tu número de orden es <span style="font-family:${FONT_MONO};font-size:14px;color:${COLOR.foreground};">${escapeHtml(id)}</span>. Guarda este correo como comprobante de tu inscripción.
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.card};border:1px solid ${COLOR.border};border-radius:12px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 8px 0;font-family:${FONT_MONO};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR.primary};">Tu inscripción</p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tbody>
${rows}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background-color:${COLOR.primary};">
                    <a href="${SITE_URL}" target="_blank" style="display:inline-block;padding:12px 22px;font-family:${FONT_SANS};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Ir al sitio del congreso</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid ${COLOR.border};padding-top:20px;font-family:${FONT_SANS};font-size:13px;line-height:20px;color:${COLOR.muted};">
              <p style="margin:0 0 8px 0;">¿Tienes problemas? Escríbenos a <a href="mailto:${CONTACT_EMAIL}" style="color:${COLOR.foreground};font-weight:600;">${CONTACT_EMAIL}</a>.</p>
              <p style="margin:0;">Has recibido este correo por tu reciente compra en la página de CCEMUC. Si no has realizado ninguna compra, puedes eliminar este correo.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
