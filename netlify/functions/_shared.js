const crypto = require('crypto');
const {
  cert,
  getApps,
  initializeApp
} = require('firebase-admin/app');
const {
  FieldValue,
  getFirestore
} = require('firebase-admin/firestore');

function getDb() {
  if (!getApps().length) {
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '')
      .replace(/\\n/g, '\n');

    if (!process.env.FIREBASE_PROJECT_ID ||
        !process.env.FIREBASE_CLIENT_EMAIL ||
        !privateKey) {
      throw new Error('Firebase Admin environment variables are not configured.');
    }

    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
  }

  return getFirestore();
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

function getPaystackSecret() {
  const secret = String(process.env.PAYSTACK_SECRET_KEY || '').trim();
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  return secret;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function makeReference() {
  return `NB-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
}

async function paystackRequest(path, options = {}) {
  const secret = getPaystackSecret();

  const response = await fetch(`https://api.paystack.co${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.status === false) {
    const message = data.message || `Paystack request failed with HTTP ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.paystack = data;
    throw error;
  }

  return data;
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = getPaystackSecret();
  if (!signature || !rawBody) return false;

  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getProductsMap(db) {
  const snapshot = await db.collection('products').get();
  const map = new Map();

  snapshot.forEach(doc => {
    const data = doc.data() || {};
    map.set(String(doc.id), { ...data, firestoreId: doc.id });
    if (data.id !== undefined && data.id !== null) {
      map.set(String(data.id), { ...data, firestoreId: doc.id });
    }
  });

  return map;
}

async function calculateOrder(db, rawItems, state) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const products = await getProductsMap(db);
  const items = [];
  let subtotal = 0;
  let totalQuantity = 0;

  for (const rawItem of rawItems) {
    const productId = rawItem?.productId ?? rawItem?.id;
    const qty = Number(rawItem?.qty);

    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new Error('Invalid cart item.');
    }

    const product = products.get(String(productId));
    if (!product) {
      throw new Error(`Product ${productId} is no longer available.`);
    }

    const price = Number(product.price);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Product ${product.name || productId} has an invalid price.`);
    }

    subtotal += price * qty;
    totalQuantity += qty;

    items.push({
      id: product.id ?? product.firestoreId,
      productId: product.id ?? product.firestoreId,
      name: product.name || 'Product',
      price,
      qty,
      sellerId: product.sellerId ? String(product.sellerId) : '',
      sellerName: product.sellerName || 'NEARBUY Seller',
      image: product.image || ''
    });
  }

  const serviceFee = totalQuantity * 100;
  const delivery = state === 'Lagos' ? 1500 : 3500;
  const total = subtotal + serviceFee + delivery;

  return {
    items,
    subtotal,
    serviceFee,
    delivery,
    total,
    totalQuantity
  };
}

async function findOrderByReference(db, reference) {
  const snapshot = await db.collection('orders')
    .where('ref', '==', reference)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return snapshot.docs[0];
}

async function markPaymentSuccessful(reference, transactionData) {
  const db = getDb();
  const orderDoc = await findOrderByReference(db, reference);

  if (!orderDoc) {
    throw new Error(`NEARBUY order for payment reference ${reference} was not found.`);
  }

  const paymentAmount = Number(transactionData.amount);
  const result = await db.runTransaction(async transaction => {
    const currentDoc = await transaction.get(orderDoc.ref);
    const current = currentDoc.data() || {};

    if (current.paymentStatus === 'success') {
      return { changed: false, order: current };
    }

    const expectedAmount = Math.round(Number(current.total) * 100);
    if (!Number.isFinite(expectedAmount) || paymentAmount !== expectedAmount) {
      throw new Error(
        `Payment amount mismatch for ${reference}. Expected ${expectedAmount}, received ${paymentAmount}.`
      );
    }

    const update = {
      paymentStatus: 'success',
      status: 'Payment Confirmed',
      paystackStatus: transactionData.status || 'success',
      paystackTransactionId: transactionData.id ?? null,
      paidAt: new Date().toISOString(),
      paymentVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    transaction.update(orderDoc.ref, update);

    return {
      changed: true,
      order: { ...current, ...update }
    };
  });

  if (result.changed) {
    const order = result.order;
    const sellerIds = [
      ...new Set(
        (order.items || [])
          .map(item => item.sellerId)
          .filter(Boolean)
          .map(String)
      )
    ];

    const batch = db.batch();
    const createdAt = new Date().toISOString();

    for (const sellerId of sellerIds) {
      const ref = db.collection('notifications').doc();
      batch.set(ref, {
        sellerId,
        title: 'New paid order received',
        message: `Order #${order.id} has been paid and is ready for processing.`,
        type: 'order',
        read: false,
        orderId: order.id,
        createdAt
      });
    }

    if (order.userPhone) {
      const buyerNotification = db.collection('notifications').doc();
      batch.set(buyerNotification, {
        userPhone: normalizePhone(order.userPhone),
        title: 'Payment confirmed',
        message: `Payment for order #${order.id} has been confirmed.`,
        type: 'payment',
        read: false,
        orderId: order.id,
        createdAt
      });
    }

    if (sellerIds.length || order.userPhone) {
      await batch.commit();
    }
  }

  return result;
}

module.exports = {
  FieldValue,
  getDb,
  json,
  normalizePhone,
  makeReference,
  paystackRequest,
  verifyWebhookSignature,
  calculateOrder,
  findOrderByReference,
  markPaymentSuccessful
};
