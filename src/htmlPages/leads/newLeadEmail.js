function getNewLeadEmail(name, phone, email, submittedAt) {
  return `
    <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #1a1a2e; margin-bottom: 4px;">New Lead</h2>
      <p style="color: #697a8d; font-size: 14px; margin-top: 0;">A new user just registered on the Vihara landing page.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px;">
        <tr>
          <td style="padding: 10px 12px; background: #f9fafb; font-weight: 600; color: #374151; width: 30%;">Name</td>
          <td style="padding: 10px 12px; background: #f9fafb; color: #1a1a2e;">${name}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #374151;">Phone</td>
          <td style="padding: 10px 12px; color: #1a1a2e;">${phone}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; background: #f9fafb; font-weight: 600; color: #374151;">Email</td>
          <td style="padding: 10px 12px; background: #f9fafb; color: #1a1a2e;">${email || '—'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; font-weight: 600; color: #374151;">Submitted At</td>
          <td style="padding: 10px 12px; color: #1a1a2e;">${submittedAt}</td>
        </tr>
      </table>
    </div>
  `;
}

module.exports = getNewLeadEmail;
