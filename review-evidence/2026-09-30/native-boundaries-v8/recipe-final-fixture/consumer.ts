import { fulfillOrder as executeOrder, OrderService } from "./service";

export function runOrder() {
    const service = new OrderService();
    service.validate("order-1");
    executeOrder("first", 1);
    return executeOrder("item-1");
}