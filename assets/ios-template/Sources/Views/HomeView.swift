import SwiftUI

struct HomeView: View {
    @State private var viewModel = HomeViewModel()

    var body: some View {
        NavigationStack {
            VStack(spacing: 8) {
                if viewModel.isLoading {
                    ProgressView()
                } else {
                    Text("Welcome to {{ProjectName}}")
                        .font(.title)
                    Text("Start building your app here.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Home")
            .task {
                await viewModel.loadData()
            }
        }
    }
}

#Preview {
    HomeView()
}
