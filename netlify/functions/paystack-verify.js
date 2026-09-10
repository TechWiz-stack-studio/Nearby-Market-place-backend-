const {
  json,
  paystackRequest,
  markPaymentSuccessful
} = require('./_shared');

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { status: false, message: 'Method not allowed.' });
  }

  const reference = String(event.queryStringParameters?.reference || '').trim();
  if (!reference) {
    return json(400, { status: false, message: 'Payment reference is required.' });
  }

  try {
    const paystack = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      { method: 'GET' }
    );

    if (paystack.data?.status === 'success') {
      await markPaymentSuccessful(reference, paystack.data);
    }

    return json(200, {
      status: true,
      message: paystack.message,
      data: {
        status: paystack.data?.status,
        reference: paystack.data?.reference,
        amount: paystack.data?.amount,
        transactionId: paystack.data?.id
      }
    });
  } catch (error) {
    console.error('Paystack verify error:', error);
    return json(error.statusCode || 500, {
      status: false,
      message: error.message || 'Could not verify payment.'
    });
  }
};
