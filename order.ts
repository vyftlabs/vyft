import { z } from 'zod';

export const orderItemSchema = z.object({
    id: z.string(),
    productId: z.string(),
    quantity: z.number().positive(),
    unitPrice: z.number().nonnegative(),
});

export const orderSchema = z.object({
    id: z.string(),
    customerId: z.string(),
    status: z.enum(['draft', 'submitted']),
    items: z.array(orderItemSchema),
});

export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;

export const addItem = (order: Order, item: OrderItem): Order => {
    if (order.status === 'submitted') throw new Error('Order already submitted');

    const existing = order.items.find((i) => i.productId === item.productId);
    const items = existing
        ? order.items.map((i) =>
            i.productId === item.productId
                ? { ...i, quantity: i.quantity + item.quantity }
                : i,
        )
        : [...order.items, item];

    return { ...order, items };
};

export const removeItem = (order: Order, productId: string): Order => {
    if (order.status === 'submitted') throw new Error('Order already submitted');
    return { ...order, items: order.items.filter((i) => i.productId !== productId) };
};

export const submit = (order: Order): Order => {
    if (order.items.length === 0) throw new Error('Cannot submit empty order');
    return { ...order, status: 'submitted' };
};

export const totalCost = (order: Order): number =>
    order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);