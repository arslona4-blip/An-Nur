import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/auth";
import {
  createDeliveryOrder,
  DELIVERY_STATUSES,
  getDeliveryOrder,
  listDeliveryOrders,
  updateDeliveryStatus,
} from "@/lib/phase3";

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id) return NextResponse.json({ order: getDeliveryOrder(Number(id)) });
    const status = url.searchParams.get("status") || undefined;
    return NextResponse.json({ orders: listDeliveryOrders(status), statuses: DELIVERY_STATUSES });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (body.action === "status") {
      return NextResponse.json({
        order: updateDeliveryStatus(Number(body.id), body.status, body.paymentMethod),
      });
    }
    return NextResponse.json({
      order: createDeliveryOrder({
        userId: user.id,
        customerId: body.customerId,
        customerName: body.customerName,
        phone: body.phone,
        address: body.address,
        deliveryFee: Number(body.deliveryFee || 0),
        note: body.note,
        items: body.items || [],
      }),
    });
  } catch (e) {
    return jsonError(e);
  }
}
