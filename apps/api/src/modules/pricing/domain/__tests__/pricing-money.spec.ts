import { PricingMoney } from "../pricing-money";

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Test failed: ${msg}`);
}

export function runPricingMoneyTests() {
  // Test 1: init and formatting
  {
    const money = PricingMoney.from(100.5, "KES");
    assert(money.amount === 100.5, "amount should be 100.5");
    assert(money.displayAmount === 100.5, "displayAmount should be 100.5");
    assert(money.format() === "KES 100.50", "format should be KES 100.50");
  }

  // Test 2: arithmetic precision
  {
    const a = PricingMoney.from(10.1, "KES");
    const b = PricingMoney.from(20.2, "KES");
    const sum = a.add(b);
    assert(sum.displayAmount === 30.3, "sum should be 30.3");

    const diff = sum.subtract(a);
    assert(diff.displayAmount === 20.2, "diff should be 20.2");
  }

  // Test 3: multiplication
  {
    const base = PricingMoney.from(100, "KES");
    const multiplied = base.multiply(1.35); // 35% surcharge
    assert(multiplied.displayAmount === 135, "multiplied should be 135");
  }

  // Test 4: percentage
  {
    const subtotal = PricingMoney.from(5000, "KES");
    const discount = subtotal.percentage(15); // 15% discount
    assert(discount.displayAmount === 750, "discount should be 750");
  }

  // Test 5: currency mismatch
  {
    const kes = PricingMoney.from(100, "KES");
    const usd = PricingMoney.from(100, "USD");
    let threw = false;
    try {
      kes.add(usd);
    } catch {
      threw = true;
    }
    assert(threw, "should throw on currency mismatch");
  }
}


