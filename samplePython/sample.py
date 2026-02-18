mySecretNumber = 12345

def greet(name):
    print(f"Hello, {name}!")


def add(a, b):
    return a + b


class Calculator:
    def __init__(self):
        self.memory = 0

    def multiply(self, x, y):
        result = x * y
        self.memory = result
        return result

    @staticmethod
    def subtract(x, y):
        return x - Y


greet("Morgan")

sum_result = add(10, 5)
print(f"Sum: {sum_result}")

calc = Calculator()

product = calc.multiply(3, 4)
print(f"Product: {product}")
print(f"Stored in memory: {calc.memory}")

difference = Calculator.subtract(9, 2)
print(f"Difference: {difference}")

