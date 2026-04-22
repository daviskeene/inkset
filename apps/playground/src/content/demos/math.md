Here's the short tour. These four show up constantly once you start reading ML papers:

### Matrix multiplication

Given $A \in \mathbb{R}^{m \times n}$ and $B \in \mathbb{R}^{n \times p}$, the product $AB \in \mathbb{R}^{m \times p}$ is:

$$(AB)_{ij} = \sum_{k=1}^{n} a_{ik}\, b_{kj}$$

Every dense layer in a neural net is this, plus a bias and a nonlinearity.

### Eigenvalues and eigenvectors

For a square $A$, any $v \neq 0$ satisfying $Av = \lambda v$ is an eigenvector with eigenvalue $\lambda$. You find them by solving:

$$\det(A - \lambda I) = 0$$

PCA is the eigendecomposition of a covariance matrix.

### Singular Value Decomposition

Any real matrix $M \in \mathbb{R}^{m \times n}$ factors as:

$$M = U \Sigma V^{*}$$

where $U$ and $V$ are orthogonal and $\Sigma$ is non-negative diagonal. Low-rank approximations, matrix inversions, and the intuition behind transformer attention all lean on this.

### The Fourier transform

$$\hat f(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx$$

Less obviously linear-algebraic, but the discrete version is literally a matrix-vector product, and it's how convolutions get computed efficiently.
