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
  const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BASE_URL } = process.env;
  
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_BASE_URL) {
    throw new Error("PayPal configuration missing. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_BASE_URL.");
  }
  
  return {
    clientId: PAYPAL_CLIENT_ID,
    clientSecret: PAYPAL_CLIENT_SECRET,
    baseUrl: PAYPAL_BASE_URL.replace(/\/$/, ""),
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
  currency: string = "USD"
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
        description: `Purchase intention: ${subject.slice(0, 100)}`,
        amount: {
          currency_code: currency,
          value: formattedAmount,
        },
      },
    ],
    application_context: {
      return_url: `${process.env.APP_BASE_URL || "http://localhost:3000"}/?intention=${intentionId}`,
      cancel_url: `${process.env.APP_BASE_URL || "http://localhost:3000"}/`,
      brand_name: "BODEGA",
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
    const error = await res.text();
    throw new Error(`PayPal order creation failed: ${res.status}`);
  }
  
  const order: PayPalOrderResponse = await res.json();
  
  // Extract approval URL for redirect
  const approvalUrl = order.links.find((link) => link.rel === "approve")?.href;
  if (!approvalUrl) {
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
  const config = getConfig();
  const token = await getAccessToken();
  
  const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  if (!res.ok) {
    const error = await res.text();
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
  const config = getConfig();
  const token = await getAccessToken();
  
  const res = await fetch(`${config.baseUrl}/v2/checkout/orders/${orderId}`, {
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
