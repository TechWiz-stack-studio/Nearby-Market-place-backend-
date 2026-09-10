const {
  getDb,
  json,
  normalizePhone,
  makeReference,
  paystackRequest,
  calculateOrder
} = require('./_shared');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { status: false, message: 'Method not allowed.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const email = String(body.email || '').trim();
    const phone = normalizePhone(body.userPhone || body.phone);
    const name = String(body.userName || 'NearBuy User').trim().slice(0, 120);
    const state = body.state === 'Lagos' ? 'Lagos' : 'Outside Lagos';
    const lga = String(body.lga || '').trim().slice(0, 120);
    const address = String(body.address || '').trim().slice(0, 500);
    const note = String(body.note || '').trim().slice(0, 500);

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return json(400, { status: false, message: 'Please provide a valid email address.' });
    }
    if (!phone || !lga || !address) {
      return json(400, { status: false, message: 'Complete delivery details are required.' });
    }

    const db = getDb();
    const calculated = await calculateOrder(db, body.items, state);
    const reference = makeReference();
    const orderId = String(body.orderId || `NB-${Date.now()}`);

    const order = {
      id: orderId,
      items: calculated.items,
      subtotal: calculated.subtotal,
      serviceFee: calculated.serviceFee,
      delivery: calculated.delivery,
      total: calculated.total,
      email,
      state,
      lga,
      address,
      phone: String(body.phone || phone).slice(0, 40),
      userPhone: phone,
      userName: name,
      note,
      ref: reference,
      paymentStatus: 'pending',
      status: 'Payment Pending Verification',
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    };

    await db.collection('orders').doc(orderId).set(order);

    try {
      const paystack = await paystackRequest('/transaction/initialize', {
        method: 'POST',
        body: JSON.stringify({
          email,
          amount: String(Math.round(calculated.total * 100)),
          currency: 'NGN',
          reference,
          metadata: {
            orderId,
            userPhone: phone,
            nearbuy: true
          }
        })
      });

      return json(200, {
        status: true,
        message: 'Payment initialized.',
        data: {
          orderId,
          reference: paystack.data.reference,
          access_code: paystack.data.access_code,
          authorization_url: paystack.data.authorization_url,
          publicKey: process.env.PAYSTACK_PUBLIC_KEY || ''
        }
      });
    } catch (paymentError) {
      await db.collection('orders').doc(orderId).update({
        paymentStatus: 'initialization_failed',
        status: 'Payment Initialization Failed',
        paymentError: paymentError.message,
        updatedAt: new Date().toISOString()
      });
      throw paymentError;
    }
  } catch (error) {
    console.error('Paystack initialize error:', error);
    return json(error.statusCode || 500, {
      status: false,
      message: error.message || 'Could not initialize payment.'
    });
  }
};
