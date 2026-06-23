import React from 'react';
import {
  buildConfirmationEmailHtml,
  type ConfirmationEmailInput,
} from '@/lib/confirmationEmail';

// Re-export the single-source-of-truth builder so callers/tests can import it from here too.
export { buildConfirmationEmailHtml };
export type { ConfirmationEmailInput, EmailCourse } from '@/lib/confirmationEmail';

/**
 * React wrapper around the canonical server-side builder. The email itself is sent by
 * sendConfirmation (which calls buildConfirmationEmailHtml directly); this component
 * exists only for on-page preview/parity with the legacy <EmailConfirmation />.
 */
export const EmailConfirmation: React.FC<ConfirmationEmailInput> = (input) => {
  return <div dangerouslySetInnerHTML={{ __html: buildConfirmationEmailHtml(input) }} />;
};

export default EmailConfirmation;
