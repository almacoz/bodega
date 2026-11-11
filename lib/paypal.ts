// PayPal REST API client for server-side operations
// Sandbox documentation: https://developer.paypal.com/docs/api/overview/

interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

interface PayPalAuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface PayPalOrderResponse {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links: Array<{ href: string; rel: string; method: string }>;
  purchase_units?: Array<{
    amount: {
      currency_code: string;
      value: string;
    };
    description?: string;
  }>;
}

interface PayPalCaptureResponse {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PENDING";
  purchase_units: Array<{
    payments: {
      captures: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
}

function getConfig(): PayPalConfig {
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
  
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal configuration missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
  }
  
  return {
    clientId: PAYPAL_CLIENT_ID,
    clientSecret: PAYPAL_CLIENT_SECRET,
    baseUrl: "https://api-m.sandbox.paypal.com",
  };
}

/**
 * Get PayPal OAuth access token.
 * Tokens are valid for ~9 hours but we don't cache them to keep implementation simple.
 */
async function getAccessToken(): Promise<string> {
  const config = getConfig();
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  
  const res = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  
  if (!res.ok) {
    throw new Error(`PayPal auth failed: ${res.status}`);
  }
  
  const data: PayPalAuthResponse = await res.json();
  return data.access_token;
}

/**
 * Create a PayPal order for a specific intention.
 * Amount and description are server-side controlled - never trust client input.
 */
export async function createPayPalOrder(
  intentionId: string,
  subject: string,
  amount: number,
  currency: string = "USD",
  productId?: string,
  reason?: string,
  merchant?: string,
): Promise<{ orderId: string; approvalUrl: string }> {
  const config = getConfig();
  const token = await getAccessToken();
  
  // Server-side validation: amount must be positive and reasonable
  if (amount <= 0 || amount > 10000) {
    throw new Error("Invalid amount");
  }
  
  // Format amount to 2 decimal places as required by PayPal
  const formattedAmount = amount.toFixed(2);
  
  const orderPayload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: intentionId,
        description: `WhyBuy: ${(reason || subject).slice(0, 119)}`.slice(0, 127),
        custom_id: intentionId.slice(0, 127),
        amount: {
          currency_code: currency,
          value: formattedAmount,
          breakdown: { item_total: { currency_code: currency, value: formattedAmount } },
        },
        items: [
          {
            name: subject.slice(0, 127),
            quantity: "1",
            unit_amount: { currency_code: currency, value: formattedAmount },
            ...(merchant ? { description: `Store: ${merchant}`.slice(0, 127) } : {}),
          },
        ],
      },
    ],
    application_context: {
      return_url: `${process.env.APP_BASE_URL || "http://localhost:3000"}/paypal/return?intentionId=${encodeURIComponent(intentionId)}${productId ? `&product=${encodeURIComponent(productId)}` : ""}`,
      cancel_url: `${process.env.APP_BASE_URL || "http://localhost:3000"}/paypal/cancel?intentionId=${encodeURIComponent(intentionId)}`,
      brand_name: "WhyBuy",
      user_action: "PAY_NOW",
    },
  };
  
  const res = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderPayload),
  });
  
  if (!res.ok) {
    throw new Error(`PayPal order creation failed: ${res.status}`);
  }
  
  const order: PayPalOrderResponse = await res.json();
  
  // Extract approval URL for redirect and verify PayPal domain
  const approvalUrl = order.links.find((link) => link.rel === "approve" || link.rel === "payer-action")?.href;
  if (!approvalUrl || !/^https:\/\/(www\.)?(sandbox\.)?paypal\.com\//i.test(approvalUrl)) {
    throw new Error("PayPal approval URL not found");
  }
  
  return {
    orderId: order.id,
    approvalUrl,
  };
}

/**
 * Capture (complete) a PayPal order after user approval.
 * Returns verified order details from PayPal.
 */
export async function capturePayPalOrder(
  orderId: string
): Promise<{ success: boolean; amount: number; currency: string; captureId: string }> {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(orderId)) {
    throw new Error("Invalid PayPal order ID");
  }
  const config = getConfig();
  const token = await getAccessToken();
  const safeOrderId = encodeURIComponent(orderId);
  const existingRes = await fetch(`${config.baseUrl}/v2/checkout/orders/${safeOrderId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (existingRes.ok) {
    const existing: PayPalOrderResponse = await existingRes.json();
    if (existing.status === "COMPLETED") {
      const unit = existing.purchase_units?.[0] as any;
      const capture = unit?.payments?.captures?.[0];
      if (capture?.id && capture?.amount?.value && capture?.amount?.currency_code) return { success: true, amount: Number(capture.amount.value), currency: capture.amount.currency_code, captureId: capture.id };
    }
  }
  
  const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${safeOrderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!res.ok) {
    throw new Error(`PayPal capture failed: ${res.status}`);
  }
  
  const capture: PayPalCaptureResponse = await res.json();
  
  // Verify capture was successful
  if (capture.status !== "COMPLETED") {
    throw new Error(`PayPal order not completed: ${capture.status}`);
  }
  
  // Extract verified payment details from PayPal's response
  const captureDetails = capture.purchase_units[0]?.payments?.captures?.[0];
  if (!captureDetails || captureDetails.status !== "COMPLETED") {
    throw new Error("PayPal capture details invalid");
  }
  
  return {
    success: true,
    amount: parseFloat(captureDetails.amount.value),
    currency: captureDetails.amount.currency_code,
    captureId: captureDetails.id,
  };
}

/**
 * Get order details from PayPal (for verification).
 */
export async function getPayPalOrderDetails(orderId: string): Promise<PayPalOrderResponse> {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(orderId)) {
    throw new Error("Invalid PayPal order ID");
  }
  const config = getConfig();
  const token = await getAccessToken();
  
  const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!res.ok) {
    throw new Error(`PayPal order details failed: ${res.status}`);
  }
  
  return res.json();
}
