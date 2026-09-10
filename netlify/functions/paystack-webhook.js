const {
  json,
  verifyWebhookSignature,
  markPaymentSuccessful
} = require('./_shared');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { status: false, message: 'Method not allowed.' });
  }

  const rawBody = event.body || '';
  const signature = event.headers?.['x-paystack-signature'] ||
    event.headers?.['X-Paystack-Signature'];

  try {
    if (!verifyWebhookSignature(rawBody, signature)) {
      return json(401, { status: false, message: 'Invalid webhook signature.' });
    }

    const payload = JSON.parse(rawBody);
    const eventName = payload.event;
    const data = payload.data || {};
    const reference = String(data.reference || '').trim();

    if (eventName === 'charge.success' && reference) {
      await markPaymentSuccessful(reference, data);
    }

    return json(200, { status: true });
  } catch (error) {
    console.error('Paystack webhook error:', error);
    return json(error.statusCode || 500, {
      status: false,
      message: error.message || 'Webhook processing failed.'
    });
  }
};
