// src/lib/confirmationEmail.tsx
import type { Course } from '@prisma/client';

export type EmailCourse = Pick<Course, 'title' | 'type' | 'week' | 'price'>;

export interface ConfirmationEmailInput {
  id: string;
  courses: EmailCourse[];
}

/**
 * Server-side replacement for the legacy <EmailConfirmation /> React component
 * (which the old frontend rendered with ReactDOMServer.renderToStaticMarkup and
 * POSTed to the API). The monolith builds the email HTML here, server-side, so
 * the client never renders or ships email markup. Called from sendConfirmation
 * (Phase 6) and re-exported by the Phase 9 mailConfirmation component.
 */
export function buildConfirmationEmailHtml({ id, courses }: ConfirmationEmailInput): string {
  const price = courses.reduce((sum, course) => sum + course.price, 0);

  const coreRows = courses
    .filter((course) => course.type === 'core')
    .map(
      (course, index) =>
        `<tr><td style="color:#666;">Módulo base ${index + 1}</td><td style="color:#333;font-weight:bold;">${course.title}</td></tr>`,
    )
    .join('');

  const otherRows = courses
    .filter((course) => course.type !== 'core')
    .map(
      (course) =>
        `<tr><td style="color:#666;">Semana ${course.week}</td><td style="color:#333;font-weight:bold;">${course.title}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Email Confirmation</title>
</head>
<body>
  <div style="background-color:#e9ecef;">
    <h1 style="margin:0;font-size:32px;font-weight:700;">Confirmante de pago</h1>
    <p style="margin:0;">Se ha confirmado el pago de tu inscripción.</p>
    <p style="margin:0;">Tu código de confirmación es: ${id}</p>
    <table width="100%">
      <tbody>
        <tr><td style="font-weight:bold;color:#666;">Cursos</td></tr>
        ${coreRows}
        ${otherRows}
        <tr><td style="font-weight:bold;color:#666;">Precio</td><td style="color:#333;font-weight:bold;">$${price}</td></tr>
      </tbody>
    </table>
    <p style="margin:0;"><a href="https://web.ccemuc.cl/" target="_blank">Congreso CCEMUC</a></p>
    <p style="margin:0;">Has recibido este correo por tu reciente compra en la página de CCEMUC. Si no has realizado ninguna compra, puedes eliminar este correo.</p>
  </div>
</body>
</html>`;
}
